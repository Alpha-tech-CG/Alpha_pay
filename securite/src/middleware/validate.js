/**
 * middleware/validate.js — Validation Zod stricte.
 *
 * Refuse les champs inconnus (.strict()), nettoie les types, renvoie 400
 * structuré sans révéler la structure interne.
 */
function validate(schema) {
  return function validateMiddleware(req, res, next) {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        code: i.code,
        message: i.message,
      }));
      return res.status(400).json({
        error: { code: 'invalid_request', issues },
      });
    }
    // Remplace req.body par la version validée + typée
    req.body = result.data;
    next();
  };
}

module.exports = { validate };
