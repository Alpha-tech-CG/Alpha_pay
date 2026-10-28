import {
  Body, Controller, ForbiddenException, Get, Header, HttpCode, HttpStatus, Inject, NotFoundException, Param, ParseEnumPipe, ParseUUIDPipe, Post, Patch, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiExcludeController, ApiOperation, ApiPropertyOptional, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { KybDocumentType, KybStatus } from '@paybrain/database';
import { MockKycProvider } from '@paybrain/providers';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiError } from '../../common/errors/api-error';
import { InternalGuard } from '../../common/guards/internal.guard';
import { StaffGuard } from '../staff/staff.guard';
import { SessionGuard } from '../auth/session.guard';
import { RequireAction } from '../team/auth/require-action.decorator';
import { RequireActionGuard } from '../team/auth/require-action.guard';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { isValidFileSignature } from '../providers/callback-token';
import { KybActor, KybService, KYC_PROVIDER, MAX_FILE_BYTES } from './kyb.service';

class UpdateKybDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(200) legalName?: string;
  @ApiPropertyOptional({ example: 'SARL' }) @IsOptional() @IsString() @MaxLength(60) legalForm?: string;
  @ApiPropertyOptional({ example: 'CG-BZV-01-2024-B12-00123' }) @IsOptional() @IsString() @MaxLength(60) rccm?: string;
  @ApiPropertyOptional({ example: 'M2024000012345X' }) @IsOptional() @IsString() @MaxLength(40) niu?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) address?: string;
  @ApiPropertyOptional({ example: 'Commerce de détail' }) @IsOptional() @IsString() @MaxLength(120) sector?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) directorFirstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) directorLastName?: string;
}

class DecisionDto {
  @IsIn(['approve', 'request_info', 'reject']) decision!: 'approve' | 'request_info' | 'reject';
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  /** Approbation sans KYC fournisseur (pièces vérifiées à la main) : motif obligatoire. */
  @IsOptional() @IsBoolean() kyc_override?: boolean;
}

const userActor = (req: any): KybActor => ({ type: 'user', id: req.appUser.id, ip: req.ip });

/** Agent AlphaPay identifié par le StaffGuard (T-90). */
function staffActor(req: any): KybActor {
  const id: string = req.staffUser?.staffId ?? req.staffUser?.email ?? '';
  if (!id) throw new ApiError(HttpStatus.UNAUTHORIZED, 'agent_requis', 'Jeton personnel AlphaPay requis');
  return { type: 'staff', id, ip: req.ip };
}

/** Dossier KYB vu par le marchand (§M2) : propriétaire et administrateurs le remplissent. */
@ApiTags('Dossier KYB')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId/kyb')
@UseGuards(SessionGuard, RequireMemberGuard, RequireActionGuard)
export class KybController {
  constructor(private readonly kyb: KybService) {}

  @Get()
  @RequireAction('kyb:manage')
  view(@Param('merchantId') merchantId: string) {
    return this.kyb.view(merchantId);
  }

  @Patch()
  @RequireAction('kyb:manage')
  update(@Param('merchantId') merchantId: string, @Body() dto: UpdateKybDto, @Req() req: any) {
    return this.kyb.update(merchantId, dto, userActor(req));
  }

  @Post('documents/:type')
  @HttpCode(201)
  @RequireAction('kyb:manage')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Déposer une pièce (PDF, JPEG, PNG, 10 Mo) : RCCM_EXTRACT, NIU_CERTIFICATE, DIRECTOR_ID' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  upload(
    @Param('merchantId') merchantId: string,
    @Param('type', new ParseEnumPipe(KybDocumentType)) type: KybDocumentType,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @Req() req: any,
  ) {
    return this.kyb.uploadDocument(merchantId, type, file, userActor(req));
  }

  @Get('documents/:documentId/url')
  @RequireAction('kyb:manage')
  async documentUrl(@Param('merchantId') merchantId: string, @Param('documentId', ParseUUIDPipe) documentId: string, @Req() req: any) {
    const app = await this.kyb.forMerchant(merchantId);
    return this.kyb.documentUrl(app.id, documentId, userActor(req), merchantId);
  }

  @Post('kyc')
  @HttpCode(201)
  @RequireAction('kyb:manage')
  @ApiOperation({ summary: "Lien de verification d'identite du dirigeant (fournisseur KYC)" })
  startKyc(@Param('merchantId') merchantId: string, @Req() req: any) {
    return this.kyb.startKyc(merchantId, userActor(req));
  }

  @Post('submit')
  @HttpCode(200)
  @RequireAction('kyb:manage')
  submit(@Param('merchantId') merchantId: string, @Req() req: any) {
    return this.kyb.submit(merchantId, userActor(req));
  }
}

/** Back-office (§M2, §M12) : file des dossiers, pièces, résultat KYC, décision motivée. */
@ApiExcludeController()
@Controller('internal/kyb')
@UseGuards(StaffGuard)
export class KybAdminController {
  constructor(private readonly kyb: KybService) {}

  @Get()
  queue(@Query('status') status?: string) {
    const s = status && (Object.values(KybStatus) as string[]).includes(status.toUpperCase()) ? (status.toUpperCase() as KybStatus) : undefined;
    return this.kyb.queue(s);
  }

  @Get(':id')
  view(@Param('id', ParseUUIDPipe) id: string) {
    return this.kyb.staffView(id);
  }

  @Get(':id/documents/:documentId/url')
  documentUrl(@Param('id', ParseUUIDPipe) id: string, @Param('documentId', ParseUUIDPipe) documentId: string, @Req() req: any) {
    return this.kyb.documentUrl(id, documentId, staffActor(req));
  }

  @Post(':id/review')
  @HttpCode(200)
  review(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.kyb.takeForReview(id, staffActor(req));
  }

  @Post(':id/decision')
  @HttpCode(200)
  decide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto, @Req() req: any) {
    return this.kyb.decide(id, dto.decision, staffActor(req), dto.reason, dto.kyc_override === true);
  }
}

/** Fichiers par URL signée et temporaire (§M2) : seul le porteur d'une URL valide lit la pièce. */
@ApiExcludeController()
@Controller('v1/files')
export class FilesController {
  constructor(private readonly kyb: KybService) {}

  @Get(':id')
  async read(@Param('id', ParseUUIDPipe) id: string, @Query('expires') expires: string, @Query('sig') sig: string, @Res() res: any) {
    if (!isValidFileSignature(id, expires, sig)) throw new ForbiddenException('Lien expiré ou invalide');
    const { doc, content } = await this.kyb.readDocument(id);
    res.set({
      'Content-Type': doc.contentType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.filename)}"`,
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(content);
  }
}

/** Webhook du fournisseur KYC (Sumsub ou mock). */
@ApiExcludeController()
@Controller('webhooks/kyc')
export class KycWebhookController {
  constructor(private readonly kyb: KybService) {}

  @Post(':provider')
  @HttpCode(200)
  handle(@Param('provider') provider: string, @Req() req: any) {
    if (provider !== this.kyb.kycProvider.name.replace(/^mock-kyc$/, 'mock')) throw new NotFoundException();
    const raw = req.rawBody as Buffer | undefined;
    return this.kyb.handleKycWebhook({ headers: req.headers, body: req.body, rawBody: raw?.toString('utf8') });
  }
}

/**
 * Page factice du fournisseur KYC (développement et recette sans contrat
 * Sumsub) : le « dirigeant » valide, et un webhook signé est rejoué comme le
 * ferait le vrai fournisseur. Absente en production.
 */
@ApiExcludeController()
@Controller('mock/kyc')
export class MockKycController {
  constructor(
    private readonly kyb: KybService,
    @Inject(KYC_PROVIDER) private readonly provider: unknown,
  ) {}

  private mock(): MockKycProvider {
    if (process.env.NODE_ENV === 'production' || !(this.provider instanceof MockKycProvider)) throw new NotFoundException();
    return this.provider;
  }

  @Get(':applicantId')
  @Header('Content-Type', 'text/html; charset=utf-8')
  page(@Param('applicantId') applicantId: string) {
    this.mock();
    const id = applicantId.replace(/[^A-Za-z0-9_-]/g, '');
    return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vérification d'identité (test)</title>
<body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px;color:#0B1E3D">
<h1 style="font-size:20px">Vérification d'identité — mode test</h1>
<p>Ce faux fournisseur remplace Sumsub en développement. Un nom de famille contenant « REJET » est refusé, « REPRISE » demande une reprise.</p>
<form method="post" action="/mock/kyc/${id}/submit"><button style="height:48px;width:100%;border:0;border-radius:10px;background:#00B4D8;font-weight:700;font-size:16px">Envoyer mes pièces</button></form></body></html>`;
  }

  @Post(':applicantId/submit')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async submit(@Param('applicantId') applicantId: string) {
    const mock = this.mock();
    const result = await this.kyb.handleKycWebhook(mock.signWebhook(mock.submit(applicantId)));
    return `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px"><h1 style="font-size:20px">Vérification envoyée</h1><p>Résultat : <b>${String((result as any).status ?? 'en attente')}</b>. Vous pouvez fermer cette page.</p></body>`;
  }
}
