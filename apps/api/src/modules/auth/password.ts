import * as argon2 from 'argon2';
import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error';

// Argon2id (§M1) : paramètres OWASP « mémoire 64 Mio, 3 passes ».
const OPTIONS: argon2.Options = { type: argon2.argon2id, memoryCost: 64 * 1024, timeCost: 3, parallelism: 4 };

export const PASSWORD_MIN_LENGTH = 10;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

let dummyHash: Promise<string> | null = null;

/**
 * Vérifie un mot de passe. Sans compte, on vérifie quand même contre un haché
 * factice : le temps de réponse ne révèle pas si l'identifiant existe.
 */
export async function verifyPassword(hash: string | null | undefined, password: string): Promise<boolean> {
  if (!hash) {
    dummyHash ??= argon2.hash('mot-de-passe-factice-pour-temps-constant', OPTIONS);
    await argon2.verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return argon2.verify(hash, password).catch(() => false);
}

/** Règles minimales : 10 caractères, lettres et chiffres, sans reprendre l'email ni le téléphone. */
export function assertPasswordStrength(password: string, context: { email?: string; phone?: string } = {}): void {
  const fail = (message: string) => new ApiError(HttpStatus.BAD_REQUEST, 'mot_de_passe_trop_faible', message, 'password');
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw fail(`Le mot de passe doit compter au moins ${PASSWORD_MIN_LENGTH} caractères`);
  }
  if (password.length > 128) throw fail('Le mot de passe ne doit pas dépasser 128 caractères');
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) throw fail('Le mot de passe doit contenir des lettres et des chiffres');
  const lower = password.toLowerCase();
  const local = context.email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) throw fail('Le mot de passe ne doit pas reprendre votre email');
  const digits = context.phone?.replace(/\D/g, '').slice(-8);
  if (digits && lower.includes(digits)) throw fail('Le mot de passe ne doit pas reprendre votre numéro');
}
