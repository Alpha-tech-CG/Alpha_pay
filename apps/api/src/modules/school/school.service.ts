import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { toMajorAmount } from '../../common/money';
import { InvoicesService } from '../invoicing/invoices.service';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateSchoolYearDto { label: string; starts_on: string; ends_on: string }
export interface CreateClassDto { name: string; capacity?: number }
export interface CreateStudentDto {
  first_name: string; last_name: string; school_class_id?: string;
  date_of_birth?: string; gender?: string; registration_no?: string;
  metadata?: Record<string, unknown>;
}
export interface GuardianDto {
  name: string; phone?: string; email?: string; relation?: string; is_primary?: boolean;
}
export interface FeeGridLineDto { label: string; amount: number; due_date?: string; sort_order?: number }
export interface CreateFeeGridDto { label: string; school_class_id?: string; currency?: string; lines: FeeGridLineDto[] }

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SchoolService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly invoices: InvoicesService,
  ) {}

  // ─── Années ────────────────────────────────────────────────────────────────

  createYear(merchantId: string, dto: CreateSchoolYearDto) {
    return this.prisma.schoolYear.create({
      data: { merchantId, label: dto.label, startsOn: new Date(dto.starts_on), endsOn: new Date(dto.ends_on) },
    });
  }

  listYears(merchantId: string) {
    return this.prisma.schoolYear.findMany({ where: { merchantId }, orderBy: { startsOn: 'desc' } });
  }

  async activateYear(merchantId: string, yearId: string) {
    await this.prisma.schoolYear.updateMany({ where: { merchantId }, data: { isActive: false } });
    return this.prisma.schoolYear.update({ where: { id: yearId }, data: { isActive: true } });
  }

  // ─── Classes ──────────────────────────────────────────────────────────────

  createClass(merchantId: string, yearId: string, dto: CreateClassDto) {
    return this.prisma.schoolClass.create({
      data: { merchantId, schoolYearId: yearId, name: dto.name, capacity: dto.capacity },
    });
  }

  listClasses(merchantId: string, yearId: string) {
    return this.prisma.schoolClass.findMany({ where: { merchantId, schoolYearId: yearId }, orderBy: { name: 'asc' } });
  }

  // ─── Élèves ───────────────────────────────────────────────────────────────

  createStudent(merchantId: string, dto: CreateStudentDto) {
    return this.prisma.student.create({
      data: {
        merchantId,
        firstName: dto.first_name,
        lastName: dto.last_name,
        schoolClassId: dto.school_class_id,
        dateOfBirth: dto.date_of_birth ? new Date(dto.date_of_birth) : undefined,
        gender: dto.gender,
        registrationNo: dto.registration_no,
        metadata: (dto.metadata ?? {}) as any,
      },
    });
  }

  listStudents(merchantId: string, classId?: string, cursor?: string, limit = 50) {
    return this.prisma.student.findMany({
      where: { merchantId, ...(classId ? { schoolClassId: classId } : {}) },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { guardians: true },
    });
  }

  async getStudent(merchantId: string, studentId: string) {
    const s = await this.prisma.student.findFirst({
      where: { id: studentId, merchantId },
      include: { guardians: true, feeSchedules: { include: { feeGridLine: true } } },
    });
    if (!s) throw new NotFoundException('Élève introuvable');
    return s;
  }

  addGuardian(merchantId: string, studentId: string, dto: GuardianDto) {
    return this.prisma.guardian.create({
      data: { merchantId, studentId, ...dto, isPrimary: dto.is_primary ?? false },
    });
  }

  // ─── Import CSV (T-79) ────────────────────────────────────────────────────

  async importCsv(merchantId: string, classId: string, csvContent: string): Promise<{ created: number; errors: string[] }> {
    const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new BadRequestException('Fichier CSV vide ou sans données');

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const requiredCols = ['first_name', 'last_name'];
    const missing = requiredCols.filter((c) => !headers.includes(c));
    if (missing.length) throw new BadRequestException(`Colonnes manquantes : ${missing.join(', ')}`);

    const col = (row: string[], name: string) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? (row[idx] ?? '').trim() : '';
    };

    const errors: string[] = [];
    let created = 0;

    // Traitement par lot de 500
    const dataLines = lines.slice(1);
    for (let i = 0; i < dataLines.length; i++) {
      const rawRow = dataLines[i].split(',');
      const firstName = col(rawRow, 'first_name');
      const lastName = col(rawRow, 'last_name');
      if (!firstName || !lastName) {
        errors.push(`Ligne ${i + 2} : prénom ou nom manquant`);
        continue;
      }
      try {
        await this.prisma.student.create({
          data: {
            merchantId,
            schoolClassId: classId,
            firstName,
            lastName,
            gender: col(rawRow, 'gender') || undefined,
            registrationNo: col(rawRow, 'registration_no') || undefined,
            dateOfBirth: col(rawRow, 'date_of_birth') ? new Date(col(rawRow, 'date_of_birth')) : undefined,
            metadata: {},
          },
        });
        created++;
      } catch (err: any) {
        errors.push(`Ligne ${i + 2} : ${err?.message}`);
      }
    }
    return { created, errors };
  }

  // ─── Grilles de frais (T-78) ──────────────────────────────────────────────

  createFeeGrid(merchantId: string, yearId: string, dto: CreateFeeGridDto) {
    return this.prisma.feeGrid.create({
      data: {
        merchantId,
        schoolYearId: yearId,
        schoolClassId: dto.school_class_id,
        label: dto.label,
        currency: dto.currency ?? 'XAF',
        lines: {
          create: dto.lines.map((l, idx) => ({
            label: l.label,
            amount: BigInt(l.amount),
            dueDate: l.due_date ? new Date(l.due_date) : undefined,
            sortOrder: l.sort_order ?? idx,
          })),
        },
      },
      include: { lines: true },
    });
  }

  // Génère les échéanciers pour tous les élèves d'une classe à partir d'une grille
  async applyFeeGrid(merchantId: string, feeGridId: string, livemode: boolean) {
    const grid = await this.prisma.feeGrid.findFirst({
      where: { id: feeGridId, merchantId },
      include: { lines: true },
    });
    if (!grid) throw new NotFoundException('Grille introuvable');

    const students = await this.prisma.student.findMany({
      where: { merchantId, schoolClassId: grid.schoolClassId ?? undefined },
    });

    let applied = 0;
    for (const student of students) {
      for (const line of grid.lines) {
        const existing = await this.prisma.studentFeeSchedule.findFirst({
          where: { studentId: student.id, feeGridLineId: line.id },
        });
        if (existing) continue;

        // Crée une facture AlphaPay et l'échéancier élève
        const invoice = await this.invoices.create(merchantId, livemode, {
          lines: [{ description: line.label, quantity: 1, unit_price: Number(line.amount) }],
          due_date: line.dueDate?.toISOString().slice(0, 10),
        });

        await this.prisma.studentFeeSchedule.create({
          data: {
            merchantId,
            studentId: student.id,
            feeGridLineId: line.id,
            invoiceId: invoice.id,
            amount: line.amount,
            dueDate: line.dueDate,
          },
        });
        applied++;
      }
    }
    return { applied };
  }

  // ─── Tableau de bord école (T-80) ─────────────────────────────────────────

  async dashboard(merchantId: string) {
    const [totalStudents, pendingSchedules, overdueSchedules, byClass] = await Promise.all([
      this.prisma.student.count({ where: { merchantId } }),
      this.prisma.studentFeeSchedule.aggregate({
        where: { merchantId, status: 'PENDING' },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.studentFeeSchedule.aggregate({
        where: { merchantId, status: 'PENDING', dueDate: { lt: new Date() } },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.schoolClass.findMany({
        where: { merchantId },
        include: {
          _count: { select: { students: true } },
          students: {
            include: {
              feeSchedules: { where: { status: 'PENDING', dueDate: { lt: new Date() } } },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      total_students: totalStudents,
      pending: {
        count: pendingSchedules._count.id,
        amount: Number(pendingSchedules._sum.amount ?? 0n),
      },
      overdue: {
        count: overdueSchedules._count.id,
        amount: Number(overdueSchedules._sum.amount ?? 0n),
      },
      by_class: byClass.map((c) => ({
        id: c.id,
        name: c.name,
        student_count: c._count.students,
        overdue_count: c.students.reduce((n, s) => n + s.feeSchedules.length, 0),
      })),
    };
  }
}
