import { registerDecorator, ValidationOptions, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { parsePhoneNumberWithError } from 'libphonenumber-js';

/**
 * Valide un numéro de téléphone au format E.164, en interprétant les numéros
 * nationaux dans le pays par défaut (Congo-Brazzaville par défaut).
 *
 * Rejette tout ce que libphonenumber-js ne reconnaît pas comme un numéro
 * réellement valide (longueur, préfixe opérateur, indicatif pays) — pas juste
 * « une chaîne de chiffres » (ALP-152).
 */
@ValidatorConstraint({ name: 'isE164Phone', async: false })
export class IsE164PhoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.trim().length === 0) return false;
    try {
      const phone = parsePhoneNumberWithError(value, 'CG');
      return phone.isValid();
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'phone doit être un numéro de téléphone valide (format E.164 ou national Congo)';
  }
}

export function IsE164Phone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsE164PhoneConstraint,
    });
  };
}
