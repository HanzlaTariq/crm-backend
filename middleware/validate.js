import { ZodError } from 'zod';

// Generic Zod-validation middleware factory.
// Usage: router.post('/', validate({ body: createCustomerSchema }), handler)
// Validated+coerced data is written back onto req.body / req.query / req.params
// so downstream handlers can trust it.
//
// NOTE: Express 5 made `req.query` (and `req.params`) getter-only properties on
// the prototype — a plain `req.query = ...` throws
// "Cannot set property query of #<IncomingMessage> which has only a getter".
// Object.defineProperty() creates a new own property directly on the request
// object, which shadows the prototype getter instead of triggering it, so this
// works on both Express 4 and 5.
const setReqProp = (req, key, value) => {
  Object.defineProperty(req, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
};

const validate = (schemas) => (req, res, next) => {
  try {
    if (schemas.body) req.body = schemas.body.parse(req.body);
    if (schemas.query) setReqProp(req, 'query', schemas.query.parse(req.query));
    if (schemas.params) setReqProp(req, 'params', schemas.params.parse(req.params));
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const errors = err.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      }));
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors,
      });
    }
    next(err);
  }
};

export default validate;