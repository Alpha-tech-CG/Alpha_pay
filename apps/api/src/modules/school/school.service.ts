import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Guardian, Prisma, PrismaClient } from '@paybrain/database';
import { toE164 } from '@paybrain/shared';
import { AuditService } from '../../common/audit/audit.service';
import { ApiError } from '../../common/errors/api-error';
import { formatAmount, toMajorAmount, toMinor } from '../../common/money';
import { afterCursor, decodeCursor, page } from '../../common/pagination/cursor';
import { safeCell } from '../exports/exports.service';
import { InvoiceActor, InvoicesService, OPEN_STATUSES } from '../invoicing/invoices.service';
import { localDate } from '../invoicing/recovery-time';
import { CreateClassDto, CreateFeeGridDto, CreateSchoolYearDto, CreateStudentDto, GuardianDto, UpdateStudentDto } from './school.dto';
import { ImportError, parseCsv, parseXlsx, validateRows } from './school-import';

const notFound = (what: string, param: string) => new ApiError(HttpStatus.NOT_FOUND, `${param.replace(/_id$/, '')}_introuvable`, `${what} introuvable`, param);

/**
 * Pack École (§M8), construit au-dessus de Recouvrer (M7) : une grille de
 * frais appliquée à une classe crée, pour chaque élève, UNE facture dont les
 * lignes sont les frais et dont l'échéancier suit leurs dates. Chaque
 * versement a son lien de paiement ; le responsable principal est le client
 * destinataire (liens, relances, reçus au nom de l'élève).
 */
@Injectable()
export class SchoolService {
  private readonly logger = new Logger(SchoolService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly invoices: InvoicesService,
    private readonly audit: AuditService,
  ) {}

  // ─── Années ────────────────────────────────────────────────────────────────

  async createYear(merchantId: string, dto: CreateSchoolYearDto) {
    if (new Date(dto.starts_on) >= new Date(dto.ends_on)) {
      throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'dates_incoherentes', "La fin de l'année doit suivre son début", 'ends_on');
    }
    const hasActive = await this.prisma.schoolYear.count({ where: { merchantId, isActive: true } });
    const y = await this.prisma.schoolYear.create({
      data: { merchantId, label: dto.label.trim(), startsOn: new Date(dto.starts_on), endsOn: new Date(dto.ends_on), isActive: hasActive === 0 },
    });
    return presentYear(y);
  }

  async listYears(merchantId: string) {
    const years = await this.prisma.schoolYear.findMany({ where: { merchantId }, orderBy: { startsOn: 'desc' }, include: { _count: { select: { classes: true } } } });
    return { object: 'list', data: years.map((y) => ({ ...presentYear(y), class_count: y._count.classes })) };
  }

  async activateYear(merchantId: string, yearId: string) {
    await this.year(merchantId, yearId);
    await this.prisma.$transaction([
      this.prisma.schoolYear.updateMany({ where: { merchantId, isActive: true }, data: { isActive: false } }),
      this.prisma.schoolYear.update({ where: { id: yearId }, data: { isActive: true } }),
    ]);
    return presentYear(await this.year(merchantId, yearId));
  }

  private async year(merchantId: string, id: string) {
    const y = await this.prisma.schoolYear.findFirst({ where: { id, merchantId } });
    if (!y) throw notFound('Année scolaire', 'year_id');
    return y;
  }

  // ─── Classes ──────────────────────────────────────────────────────────────

  async createClass(merchantId: string, yearId: string, dto: CreateClassDto) {
    await this.year(merchantId, yearId);
    const c = await this.prisma.schoolClass.create({ data: { merchantId, schoolYearId: yearId, name: dto.name.trim(), capacity: dto.capacity ?? null } });
    return { id: c.id, object: 'school_class', name: c.name, capacity: c.capacity, year_id: c.schoolYearId, student_count: 0 };
  }

  async listClasses(merchantId: string, yearId: string) {
    await this.year(merchantId, yearId);
    const classes = await this.prisma.schoolClass.findMany({ where: { merchantId, schoolYearId: yearId }, orderBy: { name: 'asc' }, include: { _count: { select: { students: true } } } });
    return { object: 'list', data: classes.map((c) => ({ id: c.id, object: 'school_class', name: c.name, capacity: c.capacity, year_id: c.schoolYearId, student_count: c._count.students })) };
  }

  private async schoolClass(merchantId: string, id: string) {
    const c = await this.prisma.schoolClass.findFirst({ where: { id, merchantId }, include: { schoolYear: true } });
    if (!c) throw notFound('Classe', 'class_id');
    return c;
  }

  // ─── Élèves et responsables ───────────────────────────────────────────────

  async createStudent(merchantId: string, dto: CreateStudentDto) {
    if (dto.school_class_id) await this.schoolClass(merchantId, dto.school_class_id);
    try {
      const s = await this.prisma.student.create({
        data: {
          merchantId,
          firstName: dto.first_name.trim(),
          lastName: dto.last_name.trim(),
          schoolClassId: dto.school_class_id ?? null,
          dateOfBirth: dto.date_of_birth ? new Date(dto.date_of_birth) : null,
          gender: dto.gender ?? null,
          registrationNo: dto.registration_no?.trim() || null,
          guardians: { create: (dto.guardians ?? []).map((g, i) => guardianData(merchantId, g, i === 0)) },
        },
      });
      return this.getStudent(merchantId, s.id, false);
    } catch (err) {
      throw duplicateRegistration(err);
    }
  }

  async updateStudent(merchantId: string, id: string, dto: UpdateStudentDto) {
    await this.student(merchantId, id);
    if (dto.school_class_id) await this.schoolClass(merchantId, dto.school_class_id);
    try {
      await this.prisma.student.update({
        where: { id },
        data: {
          ...(dto.first_name ? { firstName: dto.first_name.trim() } : {}),
          ...(dto.last_name ? { lastName: dto.last_name.trim() } : {}),
          ...(dto.school_class_id ? { schoolClassId: dto.school_class_id } : {}),
          ...(dto.registration_no !== undefined ? { registrationNo: dto.registration_no.trim() || null } : {}),
        },
      });
    } catch (err) {
      throw duplicateRegistration(err);
    }
    return this.getStudent(merchantId, id, false);
  }

  async listStudents(merchantId: string, opts: { classId?: string; q?: string; limit: number; startingAfter?: string }) {
    const rows = await this.prisma.student.findMany({
      where: {
        merchantId,
        ...(opts.classId ? { schoolClassId: opts.classId } : {}),
        ...(opts.q
          ? { OR: [{ firstName: { contains: opts.q, mode: 'insensitive' } }, { lastName: { contains: opts.q, mode: 'insensitive' } }, { registrationNo: { contains: opts.q } }] }
          : {}),
        ...afterCursor(decodeCursor(opts.startingAfter)),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      include: { guardians: true, schoolClass: { select: { id: true, name: true } } },
    });
    return page(rows, opts.limit, (s) => presentStudent(s));
  }

  async getStudent(merchantId: string, id: string, livemode: boolean) {
    const s = await this.prisma.student.findFirst({ where: { id, merchantId }, include: { guardians: true, schoolClass: { select: { id: true, name: true } } } });
    if (!s) throw notFound('Élève', 'student_id');
    const invoices = await this.prisma.invoice.findMany({ where: { merchantId, livemode, studentId: id }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    return { ...presentStudent(s), invoices: await Promise.all(invoices.map((i) => this.invoices.get(merchantId, livemode, i.id))) };
  }

  private async student(merchantId: string, id: string) {
    const s = await this.prisma.student.findFirst({ where: { id, merchantId } });
    if (!s) throw notFound('Élève', 'student_id');
    return s;
  }

  async addGuardian(merchantId: string, studentId: string, dto: GuardianDto) {
    await this.student(merchantId, studentId);
    const count = await this.prisma.guardian.count({ where: { studentId } });
    const primary = dto.is_primary ?? count === 0;
    if (primary) await this.prisma.guardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
    await this.prisma.guardian.create({ data: { ...guardianData(merchantId, dto, primary), studentId } });
    return this.getStudent(merchantId, studentId, false);
  }

  async removeGuardian(merchantId: string, studentId: string, guardianId: string) {
    const g = await this.prisma.guardian.findFirst({ where: { id: guardianId, studentId, merchantId } });
    if (!g) throw notFound('Responsable', 'guardian_id');
    await this.prisma.guardian.delete({ where: { id: guardianId } });
    if (g.isPrimary) {
      const next = await this.prisma.guardian.findFirst({ where: { studentId }, orderBy: { createdAt: 'asc' } });
      if (next) await this.prisma.guardian.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  }

  // ─── Import CSV / Excel (T-79) ────────────────────────────────────────────

  /**
   * Import des élèves d'une classe : rapport d'erreurs ligne par ligne, les
   * lignes valides sont importées. Un matricule déjà connu met l'élève à jour
   * (changement de classe, responsables remplacés) au lieu de le dupliquer.
   */
  async importStudents(merchantId: string, classId: string, file: { buffer: Buffer; originalname: string }, actor: InvoiceActor) {
    await this.schoolClass(merchantId, classId);
    const isXlsx = /\.xlsx$/i.test(file.originalname) || file.buffer.subarray(0, 2).toString('latin1') === 'PK';
    let table: string[][];
    try {
      table = isXlsx ? await parseXlsx(file.buffer) : parseCsv(file.buffer.toString('utf8'));
    } catch {
      throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'fichier_illisible', 'Fichier illisible : utilisez le modèle CSV ou Excel', 'file');
    }
    const { students, errors } = validateRows(table);
    const started = Date.now();
    let created = 0;
    let updated = 0;
    const known = new Map(
      (await this.prisma.student.findMany({ where: { merchantId, registrationNo: { in: students.map((s) => s.registrationNo).filter((r): r is string => !!r) } }, select: { id: true, registrationNo: true } })).map((s) => [s.registrationNo!, s.id]),
    );
    for (let i = 0; i < students.length; i += 100) {
      const chunk = students.slice(i, i + 100);
      await this.prisma.$transaction(async (db) => {
        for (const s of chunk) {
          const guardians = s.guardians.map((g) => ({ merchantId, name: g.name, phone: g.phone, email: g.email, relation: g.relation, isPrimary: g.isPrimary }));
          const existing = s.registrationNo ? known.get(s.registrationNo) : undefined;
          if (existing) {
            await db.student.update({ where: { id: existing }, data: { firstName: s.firstName, lastName: s.lastName, schoolClassId: classId, dateOfBirth: s.dateOfBirth, gender: s.gender } });
            if (guardians.length) {
              await db.guardian.deleteMany({ where: { studentId: existing } });
              await db.guardian.createMany({ data: guardians.map((g) => ({ ...g, studentId: existing })) });
            }
            updated++;
          } else {
            await db.student.create({
              data: { merchantId, schoolClassId: classId, firstName: s.firstName, lastName: s.lastName, dateOfBirth: s.dateOfBirth, gender: s.gender, registrationNo: s.registrationNo, guardians: { create: guardians.map(({ merchantId: m, ...g }) => ({ ...g, merchantId: m })) } },
            });
            created++;
          }
        }
      }, { timeout: 60_000 });
    }
    await this.audit.record({ actorType: actor.type, actorId: actor.id, merchantId, action: 'school.students_imported', targetType: 'school_class', targetId: classId, ip: actor.ip ?? null, metadata: { created, updated, errors: errors.length } });
    return { object: 'import_report', total_rows: Math.max(table.length - 1, 0), created, updated, error_count: errors.length, errors: errors as ImportError[], duration_ms: Date.now() - started };
  }

  // ─── Grilles de frais (T-78) ──────────────────────────────────────────────

  async createFeeGrid(merchantId: string, yearId: string, dto: CreateFeeGridDto) {
    await this.year(merchantId, yearId);
    const cls = await this.schoolClass(merchantId, dto.school_class_id);
    if (cls.schoolYearId !== yearId) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'classe_hors_annee', "Cette classe n'appartient pas à cette année scolaire", 'school_class_id');
    const currency = dto.currency ?? 'XAF';
    const grid = await this.prisma.feeGrid.create({
      data: {
        merchantId,
        schoolYearId: yearId,
        schoolClassId: cls.id,
        label: dto.label.trim(),
        currency,
        lines: {
          create: [...dto.lines]
            .sort((a, b) => a.due_date.localeCompare(b.due_date))
            .map((l, idx) => ({ label: l.label.trim(), amount: toMinor(l.amount, currency), dueDate: new Date(l.due_date), sortOrder: idx })),
        },
      },
      include: { lines: { orderBy: { sortOrder: 'asc' } }, schoolClass: { select: { name: true } } },
    });
    return presentGrid(grid, 0);
  }

  async listFeeGrids(merchantId: string, yearId: string, livemode: boolean) {
    await this.year(merchantId, yearId);
    const grids = await this.prisma.feeGrid.findMany({
      where: { merchantId, schoolYearId: yearId },
      orderBy: { createdAt: 'asc' },
      include: { lines: { orderBy: { sortOrder: 'asc' } }, schoolClass: { select: { name: true } } },
    });
    const applied = await this.prisma.$queryRaw<{ fee_grid_id: string; n: bigint }[]>`
      SELECT l.fee_grid_id, COUNT(DISTINCT f.student_id) AS n
      FROM student_fee_schedules f JOIN fee_grid_lines l ON l.id = f.fee_grid_line_id JOIN invoices i ON i.id = f.invoice_id
      WHERE f.merchant_id = ${merchantId} AND i.livemode = ${livemode}
      GROUP BY l.fee_grid_id`;
    const counts = new Map(applied.map((a) => [a.fee_grid_id, Number(a.n)]));
    return { object: 'list', data: grids.map((g) => presentGrid(g, counts.get(g.id) ?? 0)) };
  }

  /**
   * Génère les échéanciers des élèves de la classe (§M8) : une facture par
   * élève, envoyée (numéro, liens de paiement, relances). Rejouable : un élève
   * déjà facturé pour cette grille est ignoré, un nouvel élève est ajouté.
   */
  async applyFeeGrid(merchantId: string, gridId: string, livemode: boolean, actor: InvoiceActor, opts: { notify?: boolean } = {}) {
    const grid = await this.prisma.feeGrid.findFirst({ where: { id: gridId, merchantId }, include: { lines: { orderBy: { sortOrder: 'asc' } }, schoolYear: true, schoolClass: true } });
    if (!grid || !grid.schoolClassId) throw notFound('Grille de frais', 'fee_grid_id');
    if (grid.lines.some((l) => !l.dueDate)) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'grille_incomplete', 'Chaque frais de la grille doit avoir une date limite', 'lines');
    const started = Date.now();
    const students = await this.prisma.student.findMany({ where: { merchantId, schoolClassId: grid.schoolClassId }, include: { guardians: true } });
    const done = new Set(
      (
        await this.prisma.studentFeeSchedule.findMany({
          where: { merchantId, feeGridLineId: { in: grid.lines.map((l) => l.id) }, studentId: { in: students.map((s) => s.id) } },
          select: { studentId: true, invoiceId: true },
        })
      ).map((f) => f.studentId),
    );

    let created = 0;
    const withoutContact: string[] = [];
    for (const s of students) {
      if (done.has(s.id)) continue;
      const primary = s.guardians.find((g) => g.isPrimary) ?? s.guardians[0];
      const customerId = primary ? await this.customerFor(merchantId, livemode, primary) : null;
      if (!primary || (!primary.phone && !primary.email)) withoutContact.push(`${s.firstName} ${s.lastName}`);
      const invoice = await this.invoices.create(
        merchantId,
        livemode,
        {
          customer_id: customerId ?? undefined,
          currency: grid.currency,
          notes: `${grid.label} - ${s.firstName} ${s.lastName}, ${grid.schoolClass?.name ?? ''}, ${grid.schoolYear.label}`,
          lines: grid.lines.map((l) => ({ description: l.label, quantity: 1, unit_price: toMajorAmount(l.amount, grid.currency) })),
          ...(grid.lines.length > 1
            ? { installments: grid.lines.map((l) => ({ due_date: l.dueDate!.toISOString().slice(0, 10), amount: toMajorAmount(l.amount, grid.currency), label: l.label })) }
            : { due_date: grid.lines[0].dueDate!.toISOString().slice(0, 10) }),
        },
        { type: 'system', id: 'pack-ecole' },
        { studentId: s.id },
      );
      const inst = await this.prisma.invoiceInstallment.findMany({ where: { invoiceId: invoice.id }, orderBy: { position: 'asc' } });
      await this.prisma.studentFeeSchedule.createMany({
        data: grid.lines.map((l, idx) => ({ merchantId, studentId: s.id, feeGridLineId: l.id, invoiceId: invoice.id, installmentId: inst[idx]?.id ?? null, amount: l.amount, dueDate: l.dueDate })),
        skipDuplicates: true,
      });
      await this.invoices.send(merchantId, livemode, invoice.id, { type: 'system', id: 'pack-ecole' }, { notify: opts.notify ?? false });
      created++;
    }
    await this.audit.record({ actorType: actor.type, actorId: actor.id, merchantId, action: 'school.fee_grid_applied', targetType: 'fee_grid', targetId: gridId, ip: actor.ip ?? null, metadata: { livemode, created } });
    return { object: 'fee_grid_application', invoices_created: created, already_billed: done.size, students_without_contact: withoutContact, duration_ms: Date.now() - started };
  }

  /** Client de recouvrement du responsable (un par mode), créé au besoin. */
  private async customerFor(merchantId: string, livemode: boolean, g: Guardian): Promise<string> {
    if (g.customerId) {
      const c = await this.prisma.customer.findFirst({ where: { id: g.customerId, merchantId, livemode } });
      if (c) return c.id;
    }
    const match = g.phone || g.email ? await this.prisma.customer.findFirst({ where: { merchantId, livemode, name: g.name, ...(g.phone ? { phone: g.phone } : { email: g.email }) } }) : null;
    const customer =
      match ??
      (await this.prisma.customer.create({
        data: { merchantId, livemode, name: g.name, phone: g.phone, email: g.email, preferredChannels: g.phone ? ['SMS'] : ['EMAIL'], notes: 'Responsable d’élève (Pack École)' },
      }));
    await this.prisma.guardian.update({ where: { id: g.id }, data: { customerId: customer.id } });
    return customer.id;
  }

  // ─── Liens aux responsables ───────────────────────────────────────────────

  /** Envoie au responsable principal le lien du prochain versement de chaque facture ouverte. */
  async sendLinks(merchantId: string, livemode: boolean, target: { studentId?: string; classId?: string }) {
    if (target.studentId) await this.student(merchantId, target.studentId);
    if (target.classId) await this.schoolClass(merchantId, target.classId);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        merchantId,
        livemode,
        status: { in: OPEN_STATUSES },
        studentId: target.studentId ?? { not: null },
        ...(target.classId ? { student: { schoolClassId: target.classId } } : {}),
      },
      select: { id: true },
    });
    let sent = 0;
    for (const inv of invoices) if (await this.invoices.notifyCustomer(inv.id)) sent++;
    return { object: 'links_sent', invoices: invoices.length, sent, without_contact: invoices.length - sent };
  }

  // ─── Tableau de bord école (T-80) ─────────────────────────────────────────

  /** Encaissé, attendu, impayés de l'année ; par classe en un écran (§M8). */
  async dashboard(merchantId: string, livemode: boolean, yearId?: string, now = new Date()) {
    const year = yearId ? await this.year(merchantId, yearId) : await this.prisma.schoolYear.findFirst({ where: { merchantId }, orderBy: [{ isActive: 'desc' }, { startsOn: 'desc' }] });
    if (!year) return { object: 'school_dashboard', year: null, totals: emptyTotals(), by_class: [] };
    const today = new Date(`${localDate(now)}T00:00:00.000Z`);
    const rows = await this.prisma.$queryRaw<
      { id: string; name: string; students: bigint; expected: bigint | null; collected: bigint | null; overdue: bigint | null; late_students: bigint; currency: string | null }[]
    >`
      SELECT c.id, c.name,
             COUNT(DISTINCT s.id) AS students,
             SUM(f.amount) AS expected,
             SUM(f.amount_paid) AS collected,
             SUM(CASE WHEN f.status = 'PENDING' AND f.due_date < ${today} THEN f.amount - f.amount_paid ELSE 0 END) AS overdue,
             COUNT(DISTINCT CASE WHEN f.status = 'PENDING' AND f.due_date < ${today} THEN s.id END) AS late_students,
             MAX(i.currency) AS currency
      FROM school_classes c
      LEFT JOIN students s ON s.school_class_id = c.id
      LEFT JOIN invoices i ON i.student_id = s.id AND i.livemode = ${livemode} AND i.status <> 'VOID'
      LEFT JOIN student_fee_schedules f ON f.invoice_id = i.id AND f.student_id = s.id AND f.status <> 'CANCELED'
      WHERE c.merchant_id = ${merchantId} AND c.school_year_id = ${year.id}
      GROUP BY c.id, c.name
      ORDER BY c.name`;
    const currency = rows.find((r) => r.currency)?.currency ?? 'XAF';
    const byClass = rows.map((r) => {
      const expected = r.expected ?? 0n;
      const collected = r.collected ?? 0n;
      return {
        id: r.id,
        name: r.name,
        student_count: Number(r.students),
        late_students: Number(r.late_students),
        ...amounts(expected, collected, r.overdue ?? 0n, currency),
      };
    });
    const sum = (k: 'expected' | 'collected' | 'overdue') => rows.reduce((t, r) => t + (r[k] ?? 0n), 0n);
    return {
      object: 'school_dashboard',
      year: presentYear(year),
      livemode,
      totals: {
        student_count: byClass.reduce((n, c) => n + c.student_count, 0),
        late_students: byClass.reduce((n, c) => n + c.late_students, 0),
        ...amounts(sum('expected'), sum('collected'), sum('overdue'), currency),
      },
      by_class: byClass,
    };
  }

  /** Retardataires : élèves avec au moins un frais échu impayé. */
  async lateStudents(merchantId: string, livemode: boolean, opts: { yearId?: string; classId?: string }, now = new Date()) {
    const today = new Date(`${localDate(now)}T00:00:00.000Z`);
    const studentFilter = { ...(opts.classId ? { schoolClassId: opts.classId } : {}), ...(opts.yearId ? { schoolClass: { schoolYearId: opts.yearId } } : {}) };
    // Factures de scolarité du mode demandé, encore à payer.
    const open = await this.prisma.invoice.findMany({ where: { merchantId, livemode, status: { in: OPEN_STATUSES }, student: studentFilter }, select: { id: true } });
    const rows = await this.prisma.studentFeeSchedule.findMany({
      where: { merchantId, status: 'PENDING', dueDate: { lt: today }, invoiceId: { in: open.map((i) => i.id) } },
      include: { student: { include: { schoolClass: { select: { name: true } }, guardians: true } }, feeGridLine: { select: { label: true } } },
      orderBy: { dueDate: 'asc' },
    });
    const byStudent = new Map<string, { student: (typeof rows)[number]['student']; due: bigint; oldest: Date; fees: string[] }>();
    for (const f of rows) {
      const cur = byStudent.get(f.studentId) ?? { student: f.student, due: 0n, oldest: f.dueDate!, fees: [] };
      cur.due += f.amount - f.amountPaid;
      if (f.dueDate! < cur.oldest) cur.oldest = f.dueDate!;
      cur.fees.push(f.feeGridLine.label);
      byStudent.set(f.studentId, cur);
    }
    const data = [...byStudent.values()]
      .sort((a, b) => a.student.lastName.localeCompare(b.student.lastName, 'fr'))
      .map(({ student: s, due, oldest, fees }) => {
        const g = s.guardians.find((x) => x.isPrimary) ?? s.guardians[0];
        return {
          student_id: s.id,
          name: `${s.lastName} ${s.firstName}`,
          registration_no: s.registrationNo,
          class_name: s.schoolClass?.name ?? null,
          amount_overdue: toMajorAmount(due, 'XAF'),
          amount_overdue_display: formatAmount(due, 'XAF'),
          oldest_due_date: oldest.toISOString().slice(0, 10),
          days_late: Math.floor((today.getTime() - oldest.getTime()) / 86_400_000),
          fees,
          guardian: g ? { name: g.name, phone: g.phone, email: g.email } : null,
        };
      });
    return { object: 'list', data };
  }

  async lateStudentsCsv(merchantId: string, livemode: boolean, opts: { yearId?: string; classId?: string }): Promise<Buffer> {
    const { data } = await this.lateStudents(merchantId, livemode, opts);
    const head = ['Élève', 'Matricule', 'Classe', 'Montant échu', 'Échéance la plus ancienne', 'Jours de retard', 'Frais', 'Responsable', 'Téléphone', 'Email'];
    const esc = (v: string | number) => {
      const s = String(safeCell(v) ?? '');
      return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [head, ...data.map((d) => [d.name, d.registration_no ?? '', d.class_name ?? '', d.amount_overdue, d.oldest_due_date, d.days_late, d.fees.join(' + '), d.guardian?.name ?? '', d.guardian?.phone ?? '', d.guardian?.email ?? ''])];
    return Buffer.from('﻿' + lines.map((l) => l.map(esc).join(';')).join('\r\n'), 'utf8');
  }
}

// ─── Présentation ─────────────────────────────────────────────────────────────

function presentYear(y: { id: string; label: string; startsOn: Date; endsOn: Date; isActive: boolean }) {
  return { id: y.id, object: 'school_year', label: y.label, starts_on: y.startsOn.toISOString().slice(0, 10), ends_on: y.endsOn.toISOString().slice(0, 10), active: y.isActive };
}

function presentStudent(s: Prisma.StudentGetPayload<{ include: { guardians: true; schoolClass: { select: { id: true; name: true } } } }>) {
  return {
    id: s.id,
    object: 'student',
    first_name: s.firstName,
    last_name: s.lastName,
    registration_no: s.registrationNo,
    date_of_birth: s.dateOfBirth ? s.dateOfBirth.toISOString().slice(0, 10) : null,
    gender: s.gender,
    school_class: s.schoolClass ? { id: s.schoolClass.id, name: s.schoolClass.name } : null,
    guardians: s.guardians
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
      .map((g) => ({ id: g.id, name: g.name, phone: g.phone, email: g.email, relation: g.relation, is_primary: g.isPrimary })),
    created_at: s.createdAt,
  };
}

function presentGrid(g: Prisma.FeeGridGetPayload<{ include: { lines: true; schoolClass: { select: { name: true } } } }>, studentsBilled: number) {
  const total = g.lines.reduce((t, l) => t + l.amount, 0n);
  return {
    id: g.id,
    object: 'fee_grid',
    label: g.label,
    school_class: g.schoolClassId ? { id: g.schoolClassId, name: g.schoolClass?.name ?? null } : null,
    currency: g.currency,
    total: toMajorAmount(total, g.currency),
    total_display: formatAmount(total, g.currency),
    lines: g.lines.map((l) => ({ id: l.id, label: l.label, amount: toMajorAmount(l.amount, g.currency), due_date: l.dueDate ? l.dueDate.toISOString().slice(0, 10) : null })),
    students_billed: studentsBilled,
  };
}

function amounts(expected: bigint, collected: bigint, overdue: bigint, currency: string) {
  const outstanding = expected > collected ? expected - collected : 0n;
  return {
    currency,
    expected: toMajorAmount(expected, currency),
    collected: toMajorAmount(collected, currency),
    outstanding: toMajorAmount(outstanding, currency),
    overdue: toMajorAmount(overdue, currency),
    expected_display: formatAmount(expected, currency),
    collected_display: formatAmount(collected, currency),
    outstanding_display: formatAmount(outstanding, currency),
    overdue_display: formatAmount(overdue, currency),
    collection_rate: expected > 0n ? Math.round((Number(collected) / Number(expected)) * 1000) / 10 : 0,
  };
}

function emptyTotals() {
  return { student_count: 0, late_students: 0, ...amounts(0n, 0n, 0n, 'XAF') };
}

function guardianData(merchantId: string, g: GuardianDto, isPrimary: boolean) {
  return {
    merchantId,
    name: g.name.trim(),
    phone: g.phone ? toE164(g.phone) : null,
    email: g.email?.trim().toLowerCase() ?? null,
    relation: g.relation ?? null,
    isPrimary,
  };
}

function duplicateRegistration(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return new ApiError(HttpStatus.CONFLICT, 'matricule_existant', 'Un élève porte déjà ce matricule', 'registration_no');
  }
  return err;
}
