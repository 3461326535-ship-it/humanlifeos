/**
 * 轻量输入验证中间件
 * 为每个路由提供字段校验，避免引入 express-validator 等重型依赖
 */

// 校验规则类型
const RULES = {
  required: (val) => val !== undefined && val !== null && val !== '',
  string: (val) => typeof val === 'string',
  number: (val) => typeof val === 'number' && !isNaN(val),
  positiveInt: (val) => Number.isInteger(val) && val > 0,
  array: (val) => Array.isArray(val),
  oneOf: (allowed) => (val) => allowed.includes(val),
  maxLength: (max) => (val) => typeof val === 'string' && val.length <= max
};

/**
 * @param {Object} schema - { fieldName: { rule: fn, message: string, optional?: true } }
 */
function validate(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, config] of Object.entries(schema)) {
      const value = req.body[field];

      // 可选字段：未传则跳过
      if (config.optional && (value === undefined || value === null)) {
        continue;
      }

      // 必填检查
      if (!config.optional && (value === undefined || value === null || value === '')) {
        errors.push(`缺少必填字段: ${field}`);
        continue;
      }

      // 类型/规则检查
      if (config.rule && value !== undefined && value !== null) {
        if (!config.rule(value)) {
          errors.push(config.message || `${field} 校验失败`);
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: '输入校验失败',
        errors
      });
    }

    next();
  };
}

module.exports = { validate, RULES };
