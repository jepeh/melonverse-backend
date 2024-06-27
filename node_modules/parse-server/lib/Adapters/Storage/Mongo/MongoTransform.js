"use strict";

var _logger = _interopRequireDefault(require("../../../logger"));
var _lodash = _interopRequireDefault(require("lodash"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var mongodb = require('mongodb');
var Parse = require('parse/node').Parse;
const Utils = require('../../../Utils');
const transformKey = (className, fieldName, schema) => {
  // Check if the schema is known since it's a built-in field.
  switch (fieldName) {
    case 'objectId':
      return '_id';
    case 'createdAt':
      return '_created_at';
    case 'updatedAt':
      return '_updated_at';
    case 'sessionToken':
      return '_session_token';
    case 'lastUsed':
      return '_last_used';
    case 'timesUsed':
      return 'times_used';
  }
  if (schema.fields[fieldName] && schema.fields[fieldName].__type == 'Pointer') {
    fieldName = '_p_' + fieldName;
  } else if (schema.fields[fieldName] && schema.fields[fieldName].type == 'Pointer') {
    fieldName = '_p_' + fieldName;
  }
  return fieldName;
};
const transformKeyValueForUpdate = (className, restKey, restValue, parseFormatSchema) => {
  // Check if the schema is known since it's a built-in field.
  var key = restKey;
  var timeField = false;
  switch (key) {
    case 'objectId':
    case '_id':
      if (['_GlobalConfig', '_GraphQLConfig'].includes(className)) {
        return {
          key: key,
          value: parseInt(restValue)
        };
      }
      key = '_id';
      break;
    case 'createdAt':
    case '_created_at':
      key = '_created_at';
      timeField = true;
      break;
    case 'updatedAt':
    case '_updated_at':
      key = '_updated_at';
      timeField = true;
      break;
    case 'sessionToken':
    case '_session_token':
      key = '_session_token';
      break;
    case 'expiresAt':
    case '_expiresAt':
      key = 'expiresAt';
      timeField = true;
      break;
    case '_email_verify_token_expires_at':
      key = '_email_verify_token_expires_at';
      timeField = true;
      break;
    case '_account_lockout_expires_at':
      key = '_account_lockout_expires_at';
      timeField = true;
      break;
    case '_failed_login_count':
      key = '_failed_login_count';
      break;
    case '_perishable_token_expires_at':
      key = '_perishable_token_expires_at';
      timeField = true;
      break;
    case '_password_changed_at':
      key = '_password_changed_at';
      timeField = true;
      break;
    case '_rperm':
    case '_wperm':
      return {
        key: key,
        value: restValue
      };
    case 'lastUsed':
    case '_last_used':
      key = '_last_used';
      timeField = true;
      break;
    case 'timesUsed':
    case 'times_used':
      key = 'times_used';
      timeField = true;
      break;
  }
  if (parseFormatSchema.fields[key] && parseFormatSchema.fields[key].type === 'Pointer' || !key.includes('.') && !parseFormatSchema.fields[key] && restValue && restValue.__type == 'Pointer' // Do not use the _p_ prefix for pointers inside nested documents
  ) {
    key = '_p_' + key;
  }

  // Handle atomic values
  var value = transformTopLevelAtom(restValue);
  if (value !== CannotTransform) {
    if (timeField && typeof value === 'string') {
      value = new Date(value);
    }
    if (restKey.indexOf('.') > 0) {
      return {
        key,
        value: restValue
      };
    }
    return {
      key,
      value
    };
  }

  // Handle arrays
  if (restValue instanceof Array) {
    value = restValue.map(transformInteriorValue);
    return {
      key,
      value
    };
  }

  // Handle update operators
  if (typeof restValue === 'object' && '__op' in restValue) {
    return {
      key,
      value: transformUpdateOperator(restValue, false)
    };
  }

  // Handle normal objects by recursing
  value = mapValues(restValue, transformInteriorValue);
  return {
    key,
    value
  };
};
const isRegex = value => {
  return value && value instanceof RegExp;
};
const isStartsWithRegex = value => {
  if (!isRegex(value)) {
    return false;
  }
  const matches = value.toString().match(/\/\^\\Q.*\\E\//);
  return !!matches;
};
const isAllValuesRegexOrNone = values => {
  if (!values || !Array.isArray(values) || values.length === 0) {
    return true;
  }
  const firstValuesIsRegex = isStartsWithRegex(values[0]);
  if (values.length === 1) {
    return firstValuesIsRegex;
  }
  for (let i = 1, length = values.length; i < length; ++i) {
    if (firstValuesIsRegex !== isStartsWithRegex(values[i])) {
      return false;
    }
  }
  return true;
};
const isAnyValueRegex = values => {
  return values.some(function (value) {
    return isRegex(value);
  });
};
const transformInteriorValue = restValue => {
  if (restValue !== null && typeof restValue === 'object' && Object.keys(restValue).some(key => key.includes('$') || key.includes('.'))) {
    throw new Parse.Error(Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
  }
  // Handle atomic values
  var value = transformInteriorAtom(restValue);
  if (value !== CannotTransform) {
    if (value && typeof value === 'object') {
      if (value instanceof Date) {
        return value;
      }
      if (value instanceof Array) {
        value = value.map(transformInteriorValue);
      } else {
        value = mapValues(value, transformInteriorValue);
      }
    }
    return value;
  }

  // Handle arrays
  if (restValue instanceof Array) {
    return restValue.map(transformInteriorValue);
  }

  // Handle update operators
  if (typeof restValue === 'object' && '__op' in restValue) {
    return transformUpdateOperator(restValue, true);
  }

  // Handle normal objects by recursing
  return mapValues(restValue, transformInteriorValue);
};
const valueAsDate = value => {
  if (typeof value === 'string') {
    return new Date(value);
  } else if (value instanceof Date) {
    return value;
  }
  return false;
};
function transformQueryKeyValue(className, key, value, schema, count = false) {
  switch (key) {
    case 'createdAt':
      if (valueAsDate(value)) {
        return {
          key: '_created_at',
          value: valueAsDate(value)
        };
      }
      key = '_created_at';
      break;
    case 'updatedAt':
      if (valueAsDate(value)) {
        return {
          key: '_updated_at',
          value: valueAsDate(value)
        };
      }
      key = '_updated_at';
      break;
    case 'expiresAt':
      if (valueAsDate(value)) {
        return {
          key: 'expiresAt',
          value: valueAsDate(value)
        };
      }
      break;
    case '_email_verify_token_expires_at':
      if (valueAsDate(value)) {
        return {
          key: '_email_verify_token_expires_at',
          value: valueAsDate(value)
        };
      }
      break;
    case 'objectId':
      {
        if (['_GlobalConfig', '_GraphQLConfig'].includes(className)) {
          value = parseInt(value);
        }
        return {
          key: '_id',
          value
        };
      }
    case '_account_lockout_expires_at':
      if (valueAsDate(value)) {
        return {
          key: '_account_lockout_expires_at',
          value: valueAsDate(value)
        };
      }
      break;
    case '_failed_login_count':
      return {
        key,
        value
      };
    case 'sessionToken':
      return {
        key: '_session_token',
        value
      };
    case '_perishable_token_expires_at':
      if (valueAsDate(value)) {
        return {
          key: '_perishable_token_expires_at',
          value: valueAsDate(value)
        };
      }
      break;
    case '_password_changed_at':
      if (valueAsDate(value)) {
        return {
          key: '_password_changed_at',
          value: valueAsDate(value)
        };
      }
      break;
    case '_rperm':
    case '_wperm':
    case '_perishable_token':
    case '_email_verify_token':
      return {
        key,
        value
      };
    case '$or':
    case '$and':
    case '$nor':
      return {
        key: key,
        value: value.map(subQuery => transformWhere(className, subQuery, schema, count))
      };
    case 'lastUsed':
      if (valueAsDate(value)) {
        return {
          key: '_last_used',
          value: valueAsDate(value)
        };
      }
      key = '_last_used';
      break;
    case 'timesUsed':
      return {
        key: 'times_used',
        value: value
      };
    default:
      {
        // Other auth data
        const authDataMatch = key.match(/^authData\.([a-zA-Z0-9_]+)\.id$/);
        if (authDataMatch) {
          const provider = authDataMatch[1];
          // Special-case auth data.
          return {
            key: `_auth_data_${provider}.id`,
            value
          };
        }
      }
  }
  const expectedTypeIsArray = schema && schema.fields[key] && schema.fields[key].type === 'Array';
  const expectedTypeIsPointer = schema && schema.fields[key] && schema.fields[key].type === 'Pointer';
  const field = schema && schema.fields[key];
  if (expectedTypeIsPointer || !schema && !key.includes('.') && value && value.__type === 'Pointer') {
    key = '_p_' + key;
  }

  // Handle query constraints
  const transformedConstraint = transformConstraint(value, field, count);
  if (transformedConstraint !== CannotTransform) {
    if (transformedConstraint.$text) {
      return {
        key: '$text',
        value: transformedConstraint.$text
      };
    }
    if (transformedConstraint.$elemMatch) {
      return {
        key: '$nor',
        value: [{
          [key]: transformedConstraint
        }]
      };
    }
    return {
      key,
      value: transformedConstraint
    };
  }
  if (expectedTypeIsArray && !(value instanceof Array)) {
    return {
      key,
      value: {
        $all: [transformInteriorAtom(value)]
      }
    };
  }

  // Handle atomic values
  const transformRes = key.includes('.') ? transformInteriorAtom(value) : transformTopLevelAtom(value);
  if (transformRes !== CannotTransform) {
    return {
      key,
      value: transformRes
    };
  } else {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `You cannot use ${value} as a query parameter.`);
  }
}

// Main exposed method to help run queries.
// restWhere is the "where" clause in REST API form.
// Returns the mongo form of the query.
function transformWhere(className, restWhere, schema, count = false) {
  const mongoWhere = {};
  for (const restKey in restWhere) {
    const out = transformQueryKeyValue(className, restKey, restWhere[restKey], schema, count);
    mongoWhere[out.key] = out.value;
  }
  return mongoWhere;
}
const parseObjectKeyValueToMongoObjectKeyValue = (restKey, restValue, schema) => {
  // Check if the schema is known since it's a built-in field.
  let transformedValue;
  let coercedToDate;
  switch (restKey) {
    case 'objectId':
      return {
        key: '_id',
        value: restValue
      };
    case 'expiresAt':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: 'expiresAt',
        value: coercedToDate
      };
    case '_email_verify_token_expires_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: '_email_verify_token_expires_at',
        value: coercedToDate
      };
    case '_account_lockout_expires_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: '_account_lockout_expires_at',
        value: coercedToDate
      };
    case '_perishable_token_expires_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: '_perishable_token_expires_at',
        value: coercedToDate
      };
    case '_password_changed_at':
      transformedValue = transformTopLevelAtom(restValue);
      coercedToDate = typeof transformedValue === 'string' ? new Date(transformedValue) : transformedValue;
      return {
        key: '_password_changed_at',
        value: coercedToDate
      };
    case '_failed_login_count':
    case '_rperm':
    case '_wperm':
    case '_email_verify_token':
    case '_hashed_password':
    case '_perishable_token':
      return {
        key: restKey,
        value: restValue
      };
    case 'sessionToken':
      return {
        key: '_session_token',
        value: restValue
      };
    default:
      // Auth data should have been transformed already
      if (restKey.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'can only query on ' + restKey);
      }
      // Trust that the auth data has been transformed and save it directly
      if (restKey.match(/^_auth_data_[a-zA-Z0-9_]+$/)) {
        return {
          key: restKey,
          value: restValue
        };
      }
  }
  //skip straight to transformTopLevelAtom for Bytes, they don't show up in the schema for some reason
  if (restValue && restValue.__type !== 'Bytes') {
    //Note: We may not know the type of a field here, as the user could be saving (null) to a field
    //That never existed before, meaning we can't infer the type.
    if (schema.fields[restKey] && schema.fields[restKey].type == 'Pointer' || restValue.__type == 'Pointer') {
      restKey = '_p_' + restKey;
    }
  }

  // Handle atomic values
  var value = transformTopLevelAtom(restValue);
  if (value !== CannotTransform) {
    return {
      key: restKey,
      value: value
    };
  }

  // ACLs are handled before this method is called
  // If an ACL key still exists here, something is wrong.
  if (restKey === 'ACL') {
    throw 'There was a problem transforming an ACL.';
  }

  // Handle arrays
  if (restValue instanceof Array) {
    value = restValue.map(transformInteriorValue);
    return {
      key: restKey,
      value: value
    };
  }

  // Handle normal objects by recursing
  if (Object.keys(restValue).some(key => key.includes('$') || key.includes('.'))) {
    throw new Parse.Error(Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
  }
  value = mapValues(restValue, transformInteriorValue);
  return {
    key: restKey,
    value
  };
};
const parseObjectToMongoObjectForCreate = (className, restCreate, schema) => {
  restCreate = addLegacyACL(restCreate);
  const mongoCreate = {};
  for (const restKey in restCreate) {
    if (restCreate[restKey] && restCreate[restKey].__type === 'Relation') {
      continue;
    }
    const {
      key,
      value
    } = parseObjectKeyValueToMongoObjectKeyValue(restKey, restCreate[restKey], schema);
    if (value !== undefined) {
      mongoCreate[key] = value;
    }
  }

  // Use the legacy mongo format for createdAt and updatedAt
  if (mongoCreate.createdAt) {
    mongoCreate._created_at = new Date(mongoCreate.createdAt.iso || mongoCreate.createdAt);
    delete mongoCreate.createdAt;
  }
  if (mongoCreate.updatedAt) {
    mongoCreate._updated_at = new Date(mongoCreate.updatedAt.iso || mongoCreate.updatedAt);
    delete mongoCreate.updatedAt;
  }
  return mongoCreate;
};

// Main exposed method to help update old objects.
const transformUpdate = (className, restUpdate, parseFormatSchema) => {
  const mongoUpdate = {};
  const acl = addLegacyACL(restUpdate);
  if (acl._rperm || acl._wperm || acl._acl) {
    mongoUpdate.$set = {};
    if (acl._rperm) {
      mongoUpdate.$set._rperm = acl._rperm;
    }
    if (acl._wperm) {
      mongoUpdate.$set._wperm = acl._wperm;
    }
    if (acl._acl) {
      mongoUpdate.$set._acl = acl._acl;
    }
  }
  for (var restKey in restUpdate) {
    if (restUpdate[restKey] && restUpdate[restKey].__type === 'Relation') {
      continue;
    }
    var out = transformKeyValueForUpdate(className, restKey, restUpdate[restKey], parseFormatSchema);

    // If the output value is an object with any $ keys, it's an
    // operator that needs to be lifted onto the top level update
    // object.
    if (typeof out.value === 'object' && out.value !== null && out.value.__op) {
      mongoUpdate[out.value.__op] = mongoUpdate[out.value.__op] || {};
      mongoUpdate[out.value.__op][out.key] = out.value.arg;
    } else {
      mongoUpdate['$set'] = mongoUpdate['$set'] || {};
      mongoUpdate['$set'][out.key] = out.value;
    }
  }
  return mongoUpdate;
};

// Add the legacy _acl format.
const addLegacyACL = restObject => {
  const restObjectCopy = _objectSpread({}, restObject);
  const _acl = {};
  if (restObject._wperm) {
    restObject._wperm.forEach(entry => {
      _acl[entry] = {
        w: true
      };
    });
    restObjectCopy._acl = _acl;
  }
  if (restObject._rperm) {
    restObject._rperm.forEach(entry => {
      if (!(entry in _acl)) {
        _acl[entry] = {
          r: true
        };
      } else {
        _acl[entry].r = true;
      }
    });
    restObjectCopy._acl = _acl;
  }
  return restObjectCopy;
};

// A sentinel value that helper transformations return when they
// cannot perform a transformation
function CannotTransform() {}
const transformInteriorAtom = atom => {
  // TODO: check validity harder for the __type-defined types
  if (typeof atom === 'object' && atom && !(atom instanceof Date) && atom.__type === 'Pointer') {
    return {
      __type: 'Pointer',
      className: atom.className,
      objectId: atom.objectId
    };
  } else if (typeof atom === 'function' || typeof atom === 'symbol') {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `cannot transform value: ${atom}`);
  } else if (DateCoder.isValidJSON(atom)) {
    return DateCoder.JSONToDatabase(atom);
  } else if (BytesCoder.isValidJSON(atom)) {
    return BytesCoder.JSONToDatabase(atom);
  } else if (typeof atom === 'object' && atom && atom.$regex !== undefined) {
    return new RegExp(atom.$regex);
  } else {
    return atom;
  }
};

// Helper function to transform an atom from REST format to Mongo format.
// An atom is anything that can't contain other expressions. So it
// includes things where objects are used to represent other
// datatypes, like pointers and dates, but it does not include objects
// or arrays with generic stuff inside.
// Raises an error if this cannot possibly be valid REST format.
// Returns CannotTransform if it's just not an atom
function transformTopLevelAtom(atom, field) {
  switch (typeof atom) {
    case 'number':
    case 'boolean':
    case 'undefined':
      return atom;
    case 'string':
      if (field && field.type === 'Pointer') {
        return `${field.targetClass}$${atom}`;
      }
      return atom;
    case 'symbol':
    case 'function':
      throw new Parse.Error(Parse.Error.INVALID_JSON, `cannot transform value: ${atom}`);
    case 'object':
      if (atom instanceof Date) {
        // Technically dates are not rest format, but, it seems pretty
        // clear what they should be transformed to, so let's just do it.
        return atom;
      }
      if (atom === null) {
        return atom;
      }

      // TODO: check validity harder for the __type-defined types
      if (atom.__type == 'Pointer') {
        return `${atom.className}$${atom.objectId}`;
      }
      if (DateCoder.isValidJSON(atom)) {
        return DateCoder.JSONToDatabase(atom);
      }
      if (BytesCoder.isValidJSON(atom)) {
        return BytesCoder.JSONToDatabase(atom);
      }
      if (GeoPointCoder.isValidJSON(atom)) {
        return GeoPointCoder.JSONToDatabase(atom);
      }
      if (PolygonCoder.isValidJSON(atom)) {
        return PolygonCoder.JSONToDatabase(atom);
      }
      if (FileCoder.isValidJSON(atom)) {
        return FileCoder.JSONToDatabase(atom);
      }
      return CannotTransform;
    default:
      // I don't think typeof can ever let us get here
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, `really did not expect value: ${atom}`);
  }
}

// Transforms a query constraint from REST API format to Mongo format.
// A constraint is something with fields like $lt.
// If it is not a valid constraint but it could be a valid something
// else, return CannotTransform.
// inArray is whether this is an array field.
function transformConstraint(constraint, field, count = false) {
  const inArray = field && field.type && field.type === 'Array';
  if (typeof constraint !== 'object' || !constraint) {
    return CannotTransform;
  }
  const transformFunction = inArray ? transformInteriorAtom : transformTopLevelAtom;
  const transformer = atom => {
    const result = transformFunction(atom, field);
    if (result === CannotTransform) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `bad atom: ${JSON.stringify(atom)}`);
    }
    return result;
  };
  // keys is the constraints in reverse alphabetical order.
  // This is a hack so that:
  //   $regex is handled before $options
  //   $nearSphere is handled before $maxDistance
  var keys = Object.keys(constraint).sort().reverse();
  var answer = {};
  for (var key of keys) {
    switch (key) {
      case '$lt':
      case '$lte':
      case '$gt':
      case '$gte':
      case '$exists':
      case '$ne':
      case '$eq':
        {
          const val = constraint[key];
          if (val && typeof val === 'object' && val.$relativeTime) {
            if (field && field.type !== 'Date') {
              throw new Parse.Error(Parse.Error.INVALID_JSON, '$relativeTime can only be used with Date field');
            }
            switch (key) {
              case '$exists':
              case '$ne':
              case '$eq':
                throw new Parse.Error(Parse.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
            }
            const parserResult = Utils.relativeTimeToDate(val.$relativeTime);
            if (parserResult.status === 'success') {
              answer[key] = parserResult.result;
              break;
            }
            _logger.default.info('Error while parsing relative date', parserResult);
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $relativeTime (${key}) value. ${parserResult.info}`);
          }
          answer[key] = transformer(val);
          break;
        }
      case '$in':
      case '$nin':
        {
          const arr = constraint[key];
          if (!(arr instanceof Array)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad ' + key + ' value');
          }
          answer[key] = _lodash.default.flatMap(arr, value => {
            return (atom => {
              if (Array.isArray(atom)) {
                return value.map(transformer);
              } else {
                return transformer(atom);
              }
            })(value);
          });
          break;
        }
      case '$all':
        {
          const arr = constraint[key];
          if (!(arr instanceof Array)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad ' + key + ' value');
          }
          answer[key] = arr.map(transformInteriorAtom);
          const values = answer[key];
          if (isAnyValueRegex(values) && !isAllValuesRegexOrNone(values)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'All $all values must be of regex type or none: ' + values);
          }
          break;
        }
      case '$regex':
        var s = constraint[key];
        if (typeof s !== 'string') {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad regex: ' + s);
        }
        answer[key] = s;
        break;
      case '$containedBy':
        {
          const arr = constraint[key];
          if (!(arr instanceof Array)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $containedBy: should be an array`);
          }
          answer.$elemMatch = {
            $nin: arr.map(transformer)
          };
          break;
        }
      case '$options':
        answer[key] = constraint[key];
        break;
      case '$text':
        {
          const search = constraint[key].$search;
          if (typeof search !== 'object') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $search, should be object`);
          }
          if (!search.$term || typeof search.$term !== 'string') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $term, should be string`);
          } else {
            answer[key] = {
              $search: search.$term
            };
          }
          if (search.$language && typeof search.$language !== 'string') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $language, should be string`);
          } else if (search.$language) {
            answer[key].$language = search.$language;
          }
          if (search.$caseSensitive && typeof search.$caseSensitive !== 'boolean') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $caseSensitive, should be boolean`);
          } else if (search.$caseSensitive) {
            answer[key].$caseSensitive = search.$caseSensitive;
          }
          if (search.$diacriticSensitive && typeof search.$diacriticSensitive !== 'boolean') {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `bad $text: $diacriticSensitive, should be boolean`);
          } else if (search.$diacriticSensitive) {
            answer[key].$diacriticSensitive = search.$diacriticSensitive;
          }
          break;
        }
      case '$nearSphere':
        {
          const point = constraint[key];
          if (count) {
            answer.$geoWithin = {
              $centerSphere: [[point.longitude, point.latitude], constraint.$maxDistance]
            };
          } else {
            answer[key] = [point.longitude, point.latitude];
          }
          break;
        }
      case '$maxDistance':
        {
          if (count) {
            break;
          }
          answer[key] = constraint[key];
          break;
        }
      // The SDKs don't seem to use these but they are documented in the
      // REST API docs.
      case '$maxDistanceInRadians':
        answer['$maxDistance'] = constraint[key];
        break;
      case '$maxDistanceInMiles':
        answer['$maxDistance'] = constraint[key] / 3959;
        break;
      case '$maxDistanceInKilometers':
        answer['$maxDistance'] = constraint[key] / 6371;
        break;
      case '$select':
      case '$dontSelect':
        throw new Parse.Error(Parse.Error.COMMAND_UNAVAILABLE, 'the ' + key + ' constraint is not supported yet');
      case '$within':
        var box = constraint[key]['$box'];
        if (!box || box.length != 2) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'malformatted $within arg');
        }
        answer[key] = {
          $box: [[box[0].longitude, box[0].latitude], [box[1].longitude, box[1].latitude]]
        };
        break;
      case '$geoWithin':
        {
          const polygon = constraint[key]['$polygon'];
          const centerSphere = constraint[key]['$centerSphere'];
          if (polygon !== undefined) {
            let points;
            if (typeof polygon === 'object' && polygon.__type === 'Polygon') {
              if (!polygon.coordinates || polygon.coordinates.length < 3) {
                throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; Polygon.coordinates should contain at least 3 lon/lat pairs');
              }
              points = polygon.coordinates;
            } else if (polygon instanceof Array) {
              if (polygon.length < 3) {
                throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $polygon should contain at least 3 GeoPoints');
              }
              points = polygon;
            } else {
              throw new Parse.Error(Parse.Error.INVALID_JSON, "bad $geoWithin value; $polygon should be Polygon object or Array of Parse.GeoPoint's");
            }
            points = points.map(point => {
              if (point instanceof Array && point.length === 2) {
                Parse.GeoPoint._validate(point[1], point[0]);
                return point;
              }
              if (!GeoPointCoder.isValidJSON(point)) {
                throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value');
              } else {
                Parse.GeoPoint._validate(point.latitude, point.longitude);
              }
              return [point.longitude, point.latitude];
            });
            answer[key] = {
              $polygon: points
            };
          } else if (centerSphere !== undefined) {
            if (!(centerSphere instanceof Array) || centerSphere.length < 2) {
              throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere should be an array of Parse.GeoPoint and distance');
            }
            // Get point, convert to geo point if necessary and validate
            let point = centerSphere[0];
            if (point instanceof Array && point.length === 2) {
              point = new Parse.GeoPoint(point[1], point[0]);
            } else if (!GeoPointCoder.isValidJSON(point)) {
              throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere geo point invalid');
            }
            Parse.GeoPoint._validate(point.latitude, point.longitude);
            // Get distance and validate
            const distance = centerSphere[1];
            if (isNaN(distance) || distance < 0) {
              throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere distance invalid');
            }
            answer[key] = {
              $centerSphere: [[point.longitude, point.latitude], distance]
            };
          }
          break;
        }
      case '$geoIntersects':
        {
          const point = constraint[key]['$point'];
          if (!GeoPointCoder.isValidJSON(point)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad $geoIntersect value; $point should be GeoPoint');
          } else {
            Parse.GeoPoint._validate(point.latitude, point.longitude);
          }
          answer[key] = {
            $geometry: {
              type: 'Point',
              coordinates: [point.longitude, point.latitude]
            }
          };
          break;
        }
      default:
        if (key.match(/^\$+/)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad constraint: ' + key);
        }
        return CannotTransform;
    }
  }
  return answer;
}

// Transforms an update operator from REST format to mongo format.
// To be transformed, the input should have an __op field.
// If flatten is true, this will flatten operators to their static
// data format. For example, an increment of 2 would simply become a
// 2.
// The output for a non-flattened operator is a hash with __op being
// the mongo op, and arg being the argument.
// The output for a flattened operator is just a value.
// Returns undefined if this should be a no-op.

function transformUpdateOperator({
  __op,
  amount,
  objects
}, flatten) {
  switch (__op) {
    case 'Delete':
      if (flatten) {
        return undefined;
      } else {
        return {
          __op: '$unset',
          arg: ''
        };
      }
    case 'Increment':
      if (typeof amount !== 'number') {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'incrementing must provide a number');
      }
      if (flatten) {
        return amount;
      } else {
        return {
          __op: '$inc',
          arg: amount
        };
      }
    case 'SetOnInsert':
      if (flatten) {
        return amount;
      } else {
        return {
          __op: '$setOnInsert',
          arg: amount
        };
      }
    case 'Add':
    case 'AddUnique':
      if (!(objects instanceof Array)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to add must be an array');
      }
      var toAdd = objects.map(transformInteriorAtom);
      if (flatten) {
        return toAdd;
      } else {
        var mongoOp = {
          Add: '$push',
          AddUnique: '$addToSet'
        }[__op];
        return {
          __op: mongoOp,
          arg: {
            $each: toAdd
          }
        };
      }
    case 'Remove':
      if (!(objects instanceof Array)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'objects to remove must be an array');
      }
      var toRemove = objects.map(transformInteriorAtom);
      if (flatten) {
        return [];
      } else {
        return {
          __op: '$pullAll',
          arg: toRemove
        };
      }
    default:
      throw new Parse.Error(Parse.Error.COMMAND_UNAVAILABLE, `The ${__op} operator is not supported yet.`);
  }
}
function mapValues(object, iterator) {
  const result = {};
  Object.keys(object).forEach(key => {
    result[key] = iterator(object[key]);
  });
  return result;
}
const nestedMongoObjectToNestedParseObject = mongoObject => {
  switch (typeof mongoObject) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'undefined':
      return mongoObject;
    case 'symbol':
    case 'function':
      throw 'bad value in nestedMongoObjectToNestedParseObject';
    case 'object':
      if (mongoObject === null) {
        return null;
      }
      if (mongoObject instanceof Array) {
        return mongoObject.map(nestedMongoObjectToNestedParseObject);
      }
      if (mongoObject instanceof Date) {
        return Parse._encode(mongoObject);
      }
      if (mongoObject instanceof mongodb.Long) {
        return mongoObject.toNumber();
      }
      if (mongoObject instanceof mongodb.Double) {
        return mongoObject.value;
      }
      if (BytesCoder.isValidDatabaseObject(mongoObject)) {
        return BytesCoder.databaseToJSON(mongoObject);
      }
      if (Object.prototype.hasOwnProperty.call(mongoObject, '__type') && mongoObject.__type == 'Date' && mongoObject.iso instanceof Date) {
        mongoObject.iso = mongoObject.iso.toJSON();
        return mongoObject;
      }
      return mapValues(mongoObject, nestedMongoObjectToNestedParseObject);
    default:
      throw 'unknown js type';
  }
};
const transformPointerString = (schema, field, pointerString) => {
  const objData = pointerString.split('$');
  if (objData[0] !== schema.fields[field].targetClass) {
    throw 'pointer to incorrect className';
  }
  return {
    __type: 'Pointer',
    className: objData[0],
    objectId: objData[1]
  };
};

// Converts from a mongo-format object to a REST-format object.
// Does not strip out anything based on a lack of authentication.
const mongoObjectToParseObject = (className, mongoObject, schema) => {
  switch (typeof mongoObject) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'undefined':
      return mongoObject;
    case 'symbol':
    case 'function':
      throw 'bad value in mongoObjectToParseObject';
    case 'object':
      {
        if (mongoObject === null) {
          return null;
        }
        if (mongoObject instanceof Array) {
          return mongoObject.map(nestedMongoObjectToNestedParseObject);
        }
        if (mongoObject instanceof Date) {
          return Parse._encode(mongoObject);
        }
        if (mongoObject instanceof mongodb.Long) {
          return mongoObject.toNumber();
        }
        if (mongoObject instanceof mongodb.Double) {
          return mongoObject.value;
        }
        if (BytesCoder.isValidDatabaseObject(mongoObject)) {
          return BytesCoder.databaseToJSON(mongoObject);
        }
        const restObject = {};
        if (mongoObject._rperm || mongoObject._wperm) {
          restObject._rperm = mongoObject._rperm || [];
          restObject._wperm = mongoObject._wperm || [];
          delete mongoObject._rperm;
          delete mongoObject._wperm;
        }
        for (var key in mongoObject) {
          switch (key) {
            case '_id':
              restObject['objectId'] = '' + mongoObject[key];
              break;
            case '_hashed_password':
              restObject._hashed_password = mongoObject[key];
              break;
            case '_acl':
              break;
            case '_email_verify_token':
            case '_perishable_token':
            case '_perishable_token_expires_at':
            case '_password_changed_at':
            case '_tombstone':
            case '_email_verify_token_expires_at':
            case '_account_lockout_expires_at':
            case '_failed_login_count':
            case '_password_history':
              // Those keys will be deleted if needed in the DB Controller
              restObject[key] = mongoObject[key];
              break;
            case '_session_token':
              restObject['sessionToken'] = mongoObject[key];
              break;
            case 'updatedAt':
            case '_updated_at':
              restObject['updatedAt'] = Parse._encode(new Date(mongoObject[key])).iso;
              break;
            case 'createdAt':
            case '_created_at':
              restObject['createdAt'] = Parse._encode(new Date(mongoObject[key])).iso;
              break;
            case 'expiresAt':
            case '_expiresAt':
              restObject['expiresAt'] = Parse._encode(new Date(mongoObject[key]));
              break;
            case 'lastUsed':
            case '_last_used':
              restObject['lastUsed'] = Parse._encode(new Date(mongoObject[key])).iso;
              break;
            case 'timesUsed':
            case 'times_used':
              restObject['timesUsed'] = mongoObject[key];
              break;
            case 'authData':
              if (className === '_User') {
                _logger.default.warn('ignoring authData in _User as this key is reserved to be synthesized of `_auth_data_*` keys');
              } else {
                restObject['authData'] = mongoObject[key];
              }
              break;
            default:
              // Check other auth data keys
              var authDataMatch = key.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
              if (authDataMatch && className === '_User') {
                var provider = authDataMatch[1];
                restObject['authData'] = restObject['authData'] || {};
                restObject['authData'][provider] = mongoObject[key];
                break;
              }
              if (key.indexOf('_p_') == 0) {
                var newKey = key.substring(3);
                if (!schema.fields[newKey]) {
                  _logger.default.info('transform.js', 'Found a pointer column not in the schema, dropping it.', className, newKey);
                  break;
                }
                if (schema.fields[newKey].type !== 'Pointer') {
                  _logger.default.info('transform.js', 'Found a pointer in a non-pointer column, dropping it.', className, key);
                  break;
                }
                if (mongoObject[key] === null) {
                  break;
                }
                restObject[newKey] = transformPointerString(schema, newKey, mongoObject[key]);
                break;
              } else if (key[0] == '_' && key != '__type') {
                throw 'bad key in untransform: ' + key;
              } else {
                var value = mongoObject[key];
                if (schema.fields[key] && schema.fields[key].type === 'File' && FileCoder.isValidDatabaseObject(value)) {
                  restObject[key] = FileCoder.databaseToJSON(value);
                  break;
                }
                if (schema.fields[key] && schema.fields[key].type === 'GeoPoint' && GeoPointCoder.isValidDatabaseObject(value)) {
                  restObject[key] = GeoPointCoder.databaseToJSON(value);
                  break;
                }
                if (schema.fields[key] && schema.fields[key].type === 'Polygon' && PolygonCoder.isValidDatabaseObject(value)) {
                  restObject[key] = PolygonCoder.databaseToJSON(value);
                  break;
                }
                if (schema.fields[key] && schema.fields[key].type === 'Bytes' && BytesCoder.isValidDatabaseObject(value)) {
                  restObject[key] = BytesCoder.databaseToJSON(value);
                  break;
                }
              }
              restObject[key] = nestedMongoObjectToNestedParseObject(mongoObject[key]);
          }
        }
        const relationFieldNames = Object.keys(schema.fields).filter(fieldName => schema.fields[fieldName].type === 'Relation');
        const relationFields = {};
        relationFieldNames.forEach(relationFieldName => {
          relationFields[relationFieldName] = {
            __type: 'Relation',
            className: schema.fields[relationFieldName].targetClass
          };
        });
        return _objectSpread(_objectSpread({}, restObject), relationFields);
      }
    default:
      throw 'unknown js type';
  }
};
var DateCoder = {
  JSONToDatabase(json) {
    return new Date(json.iso);
  },
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'Date';
  }
};
var BytesCoder = {
  base64Pattern: new RegExp('^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'),
  isBase64Value(object) {
    if (typeof object !== 'string') {
      return false;
    }
    return this.base64Pattern.test(object);
  },
  databaseToJSON(object) {
    let value;
    if (this.isBase64Value(object)) {
      value = object;
    } else {
      value = object.buffer.toString('base64');
    }
    return {
      __type: 'Bytes',
      base64: value
    };
  },
  isValidDatabaseObject(object) {
    return object instanceof mongodb.Binary || this.isBase64Value(object);
  },
  JSONToDatabase(json) {
    return new mongodb.Binary(Buffer.from(json.base64, 'base64'));
  },
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'Bytes';
  }
};
var GeoPointCoder = {
  databaseToJSON(object) {
    return {
      __type: 'GeoPoint',
      latitude: object[1],
      longitude: object[0]
    };
  },
  isValidDatabaseObject(object) {
    return object instanceof Array && object.length == 2;
  },
  JSONToDatabase(json) {
    return [json.longitude, json.latitude];
  },
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'GeoPoint';
  }
};
var PolygonCoder = {
  databaseToJSON(object) {
    // Convert lng/lat -> lat/lng
    const coords = object.coordinates[0].map(coord => {
      return [coord[1], coord[0]];
    });
    return {
      __type: 'Polygon',
      coordinates: coords
    };
  },
  isValidDatabaseObject(object) {
    const coords = object.coordinates[0];
    if (object.type !== 'Polygon' || !(coords instanceof Array)) {
      return false;
    }
    for (let i = 0; i < coords.length; i++) {
      const point = coords[i];
      if (!GeoPointCoder.isValidDatabaseObject(point)) {
        return false;
      }
      Parse.GeoPoint._validate(parseFloat(point[1]), parseFloat(point[0]));
    }
    return true;
  },
  JSONToDatabase(json) {
    let coords = json.coordinates;
    // Add first point to the end to close polygon
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
      coords.push(coords[0]);
    }
    const unique = coords.filter((item, index, ar) => {
      let foundIndex = -1;
      for (let i = 0; i < ar.length; i += 1) {
        const pt = ar[i];
        if (pt[0] === item[0] && pt[1] === item[1]) {
          foundIndex = i;
          break;
        }
      }
      return foundIndex === index;
    });
    if (unique.length < 3) {
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'GeoJSON: Loop must have at least 3 different vertices');
    }
    // Convert lat/long -> long/lat
    coords = coords.map(coord => {
      return [coord[1], coord[0]];
    });
    return {
      type: 'Polygon',
      coordinates: [coords]
    };
  },
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'Polygon';
  }
};
var FileCoder = {
  databaseToJSON(object) {
    return {
      __type: 'File',
      name: object
    };
  },
  isValidDatabaseObject(object) {
    return typeof object === 'string';
  },
  JSONToDatabase(json) {
    return json.name;
  },
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'File';
  }
};
module.exports = {
  transformKey,
  parseObjectToMongoObjectForCreate,
  transformUpdate,
  transformWhere,
  mongoObjectToParseObject,
  transformConstraint,
  transformPointerString
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9nZ2VyIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfbG9kYXNoIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwiZSIsInIiLCJ0IiwiT2JqZWN0Iiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5Iiwia2V5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiaSIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIm1vbmdvZGIiLCJQYXJzZSIsIlV0aWxzIiwidHJhbnNmb3JtS2V5IiwiY2xhc3NOYW1lIiwiZmllbGROYW1lIiwic2NoZW1hIiwiZmllbGRzIiwiX190eXBlIiwidHlwZSIsInRyYW5zZm9ybUtleVZhbHVlRm9yVXBkYXRlIiwicmVzdEtleSIsInJlc3RWYWx1ZSIsInBhcnNlRm9ybWF0U2NoZW1hIiwidGltZUZpZWxkIiwiaW5jbHVkZXMiLCJwYXJzZUludCIsInRyYW5zZm9ybVRvcExldmVsQXRvbSIsIkNhbm5vdFRyYW5zZm9ybSIsIkRhdGUiLCJpbmRleE9mIiwiQXJyYXkiLCJtYXAiLCJ0cmFuc2Zvcm1JbnRlcmlvclZhbHVlIiwidHJhbnNmb3JtVXBkYXRlT3BlcmF0b3IiLCJtYXBWYWx1ZXMiLCJpc1JlZ2V4IiwiUmVnRXhwIiwiaXNTdGFydHNXaXRoUmVnZXgiLCJtYXRjaGVzIiwidG9TdHJpbmciLCJtYXRjaCIsImlzQWxsVmFsdWVzUmVnZXhPck5vbmUiLCJ2YWx1ZXMiLCJpc0FycmF5IiwiZmlyc3RWYWx1ZXNJc1JlZ2V4IiwiaXNBbnlWYWx1ZVJlZ2V4Iiwic29tZSIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwidHJhbnNmb3JtSW50ZXJpb3JBdG9tIiwidmFsdWVBc0RhdGUiLCJ0cmFuc2Zvcm1RdWVyeUtleVZhbHVlIiwiY291bnQiLCJzdWJRdWVyeSIsInRyYW5zZm9ybVdoZXJlIiwiYXV0aERhdGFNYXRjaCIsInByb3ZpZGVyIiwiZXhwZWN0ZWRUeXBlSXNBcnJheSIsImV4cGVjdGVkVHlwZUlzUG9pbnRlciIsImZpZWxkIiwidHJhbnNmb3JtZWRDb25zdHJhaW50IiwidHJhbnNmb3JtQ29uc3RyYWludCIsIiR0ZXh0IiwiJGVsZW1NYXRjaCIsIiRhbGwiLCJ0cmFuc2Zvcm1SZXMiLCJJTlZBTElEX0pTT04iLCJyZXN0V2hlcmUiLCJtb25nb1doZXJlIiwib3V0IiwicGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZSIsInRyYW5zZm9ybWVkVmFsdWUiLCJjb2VyY2VkVG9EYXRlIiwiSU5WQUxJRF9LRVlfTkFNRSIsInBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSIsInJlc3RDcmVhdGUiLCJhZGRMZWdhY3lBQ0wiLCJtb25nb0NyZWF0ZSIsInVuZGVmaW5lZCIsImNyZWF0ZWRBdCIsIl9jcmVhdGVkX2F0IiwiaXNvIiwidXBkYXRlZEF0IiwiX3VwZGF0ZWRfYXQiLCJ0cmFuc2Zvcm1VcGRhdGUiLCJyZXN0VXBkYXRlIiwibW9uZ29VcGRhdGUiLCJhY2wiLCJfcnBlcm0iLCJfd3Blcm0iLCJfYWNsIiwiJHNldCIsIl9fb3AiLCJhcmciLCJyZXN0T2JqZWN0IiwicmVzdE9iamVjdENvcHkiLCJlbnRyeSIsInciLCJhdG9tIiwib2JqZWN0SWQiLCJEYXRlQ29kZXIiLCJpc1ZhbGlkSlNPTiIsIkpTT05Ub0RhdGFiYXNlIiwiQnl0ZXNDb2RlciIsIiRyZWdleCIsInRhcmdldENsYXNzIiwiR2VvUG9pbnRDb2RlciIsIlBvbHlnb25Db2RlciIsIkZpbGVDb2RlciIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImNvbnN0cmFpbnQiLCJpbkFycmF5IiwidHJhbnNmb3JtRnVuY3Rpb24iLCJ0cmFuc2Zvcm1lciIsInJlc3VsdCIsIkpTT04iLCJzdHJpbmdpZnkiLCJzb3J0IiwicmV2ZXJzZSIsImFuc3dlciIsInZhbCIsIiRyZWxhdGl2ZVRpbWUiLCJwYXJzZXJSZXN1bHQiLCJyZWxhdGl2ZVRpbWVUb0RhdGUiLCJzdGF0dXMiLCJsb2ciLCJpbmZvIiwiYXJyIiwiXyIsImZsYXRNYXAiLCJzIiwiJG5pbiIsInNlYXJjaCIsIiRzZWFyY2giLCIkdGVybSIsIiRsYW5ndWFnZSIsIiRjYXNlU2Vuc2l0aXZlIiwiJGRpYWNyaXRpY1NlbnNpdGl2ZSIsInBvaW50IiwiJGdlb1dpdGhpbiIsIiRjZW50ZXJTcGhlcmUiLCJsb25naXR1ZGUiLCJsYXRpdHVkZSIsIiRtYXhEaXN0YW5jZSIsIkNPTU1BTkRfVU5BVkFJTEFCTEUiLCJib3giLCIkYm94IiwicG9seWdvbiIsImNlbnRlclNwaGVyZSIsInBvaW50cyIsImNvb3JkaW5hdGVzIiwiR2VvUG9pbnQiLCJfdmFsaWRhdGUiLCIkcG9seWdvbiIsImRpc3RhbmNlIiwiaXNOYU4iLCIkZ2VvbWV0cnkiLCJhbW91bnQiLCJvYmplY3RzIiwiZmxhdHRlbiIsInRvQWRkIiwibW9uZ29PcCIsIkFkZCIsIkFkZFVuaXF1ZSIsIiRlYWNoIiwidG9SZW1vdmUiLCJvYmplY3QiLCJpdGVyYXRvciIsIm5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCIsIm1vbmdvT2JqZWN0IiwiX2VuY29kZSIsIkxvbmciLCJ0b051bWJlciIsIkRvdWJsZSIsImlzVmFsaWREYXRhYmFzZU9iamVjdCIsImRhdGFiYXNlVG9KU09OIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJ0b0pTT04iLCJ0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nIiwicG9pbnRlclN0cmluZyIsIm9iakRhdGEiLCJzcGxpdCIsIm1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJ3YXJuIiwibmV3S2V5Iiwic3Vic3RyaW5nIiwicmVsYXRpb25GaWVsZE5hbWVzIiwicmVsYXRpb25GaWVsZHMiLCJyZWxhdGlvbkZpZWxkTmFtZSIsImpzb24iLCJiYXNlNjRQYXR0ZXJuIiwiaXNCYXNlNjRWYWx1ZSIsInRlc3QiLCJidWZmZXIiLCJiYXNlNjQiLCJCaW5hcnkiLCJCdWZmZXIiLCJmcm9tIiwiY29vcmRzIiwiY29vcmQiLCJwYXJzZUZsb2F0IiwidW5pcXVlIiwiaXRlbSIsImluZGV4IiwiYXIiLCJmb3VuZEluZGV4IiwicHQiLCJuYW1lIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvVHJhbnNmb3JtLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBsb2cgZnJvbSAnLi4vLi4vLi4vbG9nZ2VyJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG52YXIgbW9uZ29kYiA9IHJlcXVpcmUoJ21vbmdvZGInKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcbmNvbnN0IFV0aWxzID0gcmVxdWlyZSgnLi4vLi4vLi4vVXRpbHMnKTtcblxuY29uc3QgdHJhbnNmb3JtS2V5ID0gKGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpID0+IHtcbiAgLy8gQ2hlY2sgaWYgdGhlIHNjaGVtYSBpcyBrbm93biBzaW5jZSBpdCdzIGEgYnVpbHQtaW4gZmllbGQuXG4gIHN3aXRjaCAoZmllbGROYW1lKSB7XG4gICAgY2FzZSAnb2JqZWN0SWQnOlxuICAgICAgcmV0dXJuICdfaWQnO1xuICAgIGNhc2UgJ2NyZWF0ZWRBdCc6XG4gICAgICByZXR1cm4gJ19jcmVhdGVkX2F0JztcbiAgICBjYXNlICd1cGRhdGVkQXQnOlxuICAgICAgcmV0dXJuICdfdXBkYXRlZF9hdCc7XG4gICAgY2FzZSAnc2Vzc2lvblRva2VuJzpcbiAgICAgIHJldHVybiAnX3Nlc3Npb25fdG9rZW4nO1xuICAgIGNhc2UgJ2xhc3RVc2VkJzpcbiAgICAgIHJldHVybiAnX2xhc3RfdXNlZCc7XG4gICAgY2FzZSAndGltZXNVc2VkJzpcbiAgICAgIHJldHVybiAndGltZXNfdXNlZCc7XG4gIH1cblxuICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5fX3R5cGUgPT0gJ1BvaW50ZXInKSB7XG4gICAgZmllbGROYW1lID0gJ19wXycgKyBmaWVsZE5hbWU7XG4gIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09ICdQb2ludGVyJykge1xuICAgIGZpZWxkTmFtZSA9ICdfcF8nICsgZmllbGROYW1lO1xuICB9XG5cbiAgcmV0dXJuIGZpZWxkTmFtZTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybUtleVZhbHVlRm9yVXBkYXRlID0gKGNsYXNzTmFtZSwgcmVzdEtleSwgcmVzdFZhbHVlLCBwYXJzZUZvcm1hdFNjaGVtYSkgPT4ge1xuICAvLyBDaGVjayBpZiB0aGUgc2NoZW1hIGlzIGtub3duIHNpbmNlIGl0J3MgYSBidWlsdC1pbiBmaWVsZC5cbiAgdmFyIGtleSA9IHJlc3RLZXk7XG4gIHZhciB0aW1lRmllbGQgPSBmYWxzZTtcbiAgc3dpdGNoIChrZXkpIHtcbiAgICBjYXNlICdvYmplY3RJZCc6XG4gICAgY2FzZSAnX2lkJzpcbiAgICAgIGlmIChbJ19HbG9iYWxDb25maWcnLCAnX0dyYXBoUUxDb25maWcnXS5pbmNsdWRlcyhjbGFzc05hbWUpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAga2V5OiBrZXksXG4gICAgICAgICAgdmFsdWU6IHBhcnNlSW50KHJlc3RWYWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBrZXkgPSAnX2lkJztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2NyZWF0ZWRBdCc6XG4gICAgY2FzZSAnX2NyZWF0ZWRfYXQnOlxuICAgICAga2V5ID0gJ19jcmVhdGVkX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICd1cGRhdGVkQXQnOlxuICAgIGNhc2UgJ191cGRhdGVkX2F0JzpcbiAgICAgIGtleSA9ICdfdXBkYXRlZF9hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnc2Vzc2lvblRva2VuJzpcbiAgICBjYXNlICdfc2Vzc2lvbl90b2tlbic6XG4gICAgICBrZXkgPSAnX3Nlc3Npb25fdG9rZW4nO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnZXhwaXJlc0F0JzpcbiAgICBjYXNlICdfZXhwaXJlc0F0JzpcbiAgICAgIGtleSA9ICdleHBpcmVzQXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICBrZXkgPSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnOlxuICAgICAga2V5ID0gJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnX2ZhaWxlZF9sb2dpbl9jb3VudCc6XG4gICAgICBrZXkgPSAnX2ZhaWxlZF9sb2dpbl9jb3VudCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIGtleSA9ICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JztcbiAgICAgIHRpbWVGaWVsZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcGFzc3dvcmRfY2hhbmdlZF9hdCc6XG4gICAgICBrZXkgPSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19ycGVybSc6XG4gICAgY2FzZSAnX3dwZXJtJzpcbiAgICAgIHJldHVybiB7IGtleToga2V5LCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgY2FzZSAnbGFzdFVzZWQnOlxuICAgIGNhc2UgJ19sYXN0X3VzZWQnOlxuICAgICAga2V5ID0gJ19sYXN0X3VzZWQnO1xuICAgICAgdGltZUZpZWxkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3RpbWVzVXNlZCc6XG4gICAgY2FzZSAndGltZXNfdXNlZCc6XG4gICAgICBrZXkgPSAndGltZXNfdXNlZCc7XG4gICAgICB0aW1lRmllbGQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gIH1cblxuICBpZiAoXG4gICAgKHBhcnNlRm9ybWF0U2NoZW1hLmZpZWxkc1trZXldICYmIHBhcnNlRm9ybWF0U2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdQb2ludGVyJykgfHxcbiAgICAoIWtleS5pbmNsdWRlcygnLicpICYmXG4gICAgICAhcGFyc2VGb3JtYXRTY2hlbWEuZmllbGRzW2tleV0gJiZcbiAgICAgIHJlc3RWYWx1ZSAmJlxuICAgICAgcmVzdFZhbHVlLl9fdHlwZSA9PSAnUG9pbnRlcicpIC8vIERvIG5vdCB1c2UgdGhlIF9wXyBwcmVmaXggZm9yIHBvaW50ZXJzIGluc2lkZSBuZXN0ZWQgZG9jdW1lbnRzXG4gICkge1xuICAgIGtleSA9ICdfcF8nICsga2V5O1xuICB9XG5cbiAgLy8gSGFuZGxlIGF0b21pYyB2YWx1ZXNcbiAgdmFyIHZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gIGlmICh2YWx1ZSAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgaWYgKHRpbWVGaWVsZCAmJiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICB2YWx1ZSA9IG5ldyBEYXRlKHZhbHVlKTtcbiAgICB9XG4gICAgaWYgKHJlc3RLZXkuaW5kZXhPZignLicpID4gMCkge1xuICAgICAgcmV0dXJuIHsga2V5LCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgfVxuICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBhcnJheXNcbiAgaWYgKHJlc3RWYWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgdmFsdWUgPSByZXN0VmFsdWUubWFwKHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xuICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSB1cGRhdGUgb3BlcmF0b3JzXG4gIGlmICh0eXBlb2YgcmVzdFZhbHVlID09PSAnb2JqZWN0JyAmJiAnX19vcCcgaW4gcmVzdFZhbHVlKSB7XG4gICAgcmV0dXJuIHsga2V5LCB2YWx1ZTogdHJhbnNmb3JtVXBkYXRlT3BlcmF0b3IocmVzdFZhbHVlLCBmYWxzZSkgfTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBub3JtYWwgb2JqZWN0cyBieSByZWN1cnNpbmdcbiAgdmFsdWUgPSBtYXBWYWx1ZXMocmVzdFZhbHVlLCB0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgcmV0dXJuIHsga2V5LCB2YWx1ZSB9O1xufTtcblxuY29uc3QgaXNSZWdleCA9IHZhbHVlID0+IHtcbiAgcmV0dXJuIHZhbHVlICYmIHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwO1xufTtcblxuY29uc3QgaXNTdGFydHNXaXRoUmVnZXggPSB2YWx1ZSA9PiB7XG4gIGlmICghaXNSZWdleCh2YWx1ZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBjb25zdCBtYXRjaGVzID0gdmFsdWUudG9TdHJpbmcoKS5tYXRjaCgvXFwvXFxeXFxcXFEuKlxcXFxFXFwvLyk7XG4gIHJldHVybiAhIW1hdGNoZXM7XG59O1xuXG5jb25zdCBpc0FsbFZhbHVlc1JlZ2V4T3JOb25lID0gdmFsdWVzID0+IHtcbiAgaWYgKCF2YWx1ZXMgfHwgIUFycmF5LmlzQXJyYXkodmFsdWVzKSB8fCB2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBjb25zdCBmaXJzdFZhbHVlc0lzUmVnZXggPSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbMF0pO1xuICBpZiAodmFsdWVzLmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBmaXJzdFZhbHVlc0lzUmVnZXg7XG4gIH1cblxuICBmb3IgKGxldCBpID0gMSwgbGVuZ3RoID0gdmFsdWVzLmxlbmd0aDsgaSA8IGxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGZpcnN0VmFsdWVzSXNSZWdleCAhPT0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzW2ldKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuY29uc3QgaXNBbnlWYWx1ZVJlZ2V4ID0gdmFsdWVzID0+IHtcbiAgcmV0dXJuIHZhbHVlcy5zb21lKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiBpc1JlZ2V4KHZhbHVlKTtcbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1JbnRlcmlvclZhbHVlID0gcmVzdFZhbHVlID0+IHtcbiAgaWYgKFxuICAgIHJlc3RWYWx1ZSAhPT0gbnVsbCAmJlxuICAgIHR5cGVvZiByZXN0VmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgT2JqZWN0LmtleXMocmVzdFZhbHVlKS5zb21lKGtleSA9PiBrZXkuaW5jbHVkZXMoJyQnKSB8fCBrZXkuaW5jbHVkZXMoJy4nKSlcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgKTtcbiAgfVxuICAvLyBIYW5kbGUgYXRvbWljIHZhbHVlc1xuICB2YXIgdmFsdWUgPSB0cmFuc2Zvcm1JbnRlcmlvckF0b20ocmVzdFZhbHVlKTtcbiAgaWYgKHZhbHVlICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICBpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICB9XG4gICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICB2YWx1ZSA9IHZhbHVlLm1hcCh0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlID0gbWFwVmFsdWVzKHZhbHVlLCB0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgLy8gSGFuZGxlIGFycmF5c1xuICBpZiAocmVzdFZhbHVlIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gcmVzdFZhbHVlLm1hcCh0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbiAgfVxuXG4gIC8vIEhhbmRsZSB1cGRhdGUgb3BlcmF0b3JzXG4gIGlmICh0eXBlb2YgcmVzdFZhbHVlID09PSAnb2JqZWN0JyAmJiAnX19vcCcgaW4gcmVzdFZhbHVlKSB7XG4gICAgcmV0dXJuIHRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yKHJlc3RWYWx1ZSwgdHJ1ZSk7XG4gIH1cblxuICAvLyBIYW5kbGUgbm9ybWFsIG9iamVjdHMgYnkgcmVjdXJzaW5nXG4gIHJldHVybiBtYXBWYWx1ZXMocmVzdFZhbHVlLCB0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcbn07XG5cbmNvbnN0IHZhbHVlQXNEYXRlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBuZXcgRGF0ZSh2YWx1ZSk7XG4gIH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybVF1ZXJ5S2V5VmFsdWUoY2xhc3NOYW1lLCBrZXksIHZhbHVlLCBzY2hlbWEsIGNvdW50ID0gZmFsc2UpIHtcbiAgc3dpdGNoIChrZXkpIHtcbiAgICBjYXNlICdjcmVhdGVkQXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4geyBrZXk6ICdfY3JlYXRlZF9hdCcsIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSkgfTtcbiAgICAgIH1cbiAgICAgIGtleSA9ICdfY3JlYXRlZF9hdCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlICd1cGRhdGVkQXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4geyBrZXk6ICdfdXBkYXRlZF9hdCcsIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSkgfTtcbiAgICAgIH1cbiAgICAgIGtleSA9ICdfdXBkYXRlZF9hdCc7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdleHBpcmVzQXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4geyBrZXk6ICdleHBpcmVzQXQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGtleTogJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICAgICAgICAgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ29iamVjdElkJzoge1xuICAgICAgaWYgKFsnX0dsb2JhbENvbmZpZycsICdfR3JhcGhRTENvbmZpZyddLmluY2x1ZGVzKGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdmFsdWUgPSBwYXJzZUludCh2YWx1ZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4geyBrZXk6ICdfaWQnLCB2YWx1ZSB9O1xuICAgIH1cbiAgICBjYXNlICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnOlxuICAgICAgaWYgKHZhbHVlQXNEYXRlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGtleTogJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICAgICAgICAgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19mYWlsZWRfbG9naW5fY291bnQnOlxuICAgICAgcmV0dXJuIHsga2V5LCB2YWx1ZSB9O1xuICAgIGNhc2UgJ3Nlc3Npb25Ub2tlbic6XG4gICAgICByZXR1cm4geyBrZXk6ICdfc2Vzc2lvbl90b2tlbicsIHZhbHVlIH07XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCc6XG4gICAgICBpZiAodmFsdWVBc0RhdGUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAga2V5OiAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcsXG4gICAgICAgICAgdmFsdWU6IHZhbHVlQXNEYXRlKHZhbHVlKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnLCB2YWx1ZTogdmFsdWVBc0RhdGUodmFsdWUpIH07XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlICdfcnBlcm0nOlxuICAgIGNhc2UgJ193cGVybSc6XG4gICAgY2FzZSAnX3BlcmlzaGFibGVfdG9rZW4nOlxuICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW4nOlxuICAgICAgcmV0dXJuIHsga2V5LCB2YWx1ZSB9O1xuICAgIGNhc2UgJyRvcic6XG4gICAgY2FzZSAnJGFuZCc6XG4gICAgY2FzZSAnJG5vcic6XG4gICAgICByZXR1cm4ge1xuICAgICAgICBrZXk6IGtleSxcbiAgICAgICAgdmFsdWU6IHZhbHVlLm1hcChzdWJRdWVyeSA9PiB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHN1YlF1ZXJ5LCBzY2hlbWEsIGNvdW50KSksXG4gICAgICB9O1xuICAgIGNhc2UgJ2xhc3RVc2VkJzpcbiAgICAgIGlmICh2YWx1ZUFzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiAnX2xhc3RfdXNlZCcsIHZhbHVlOiB2YWx1ZUFzRGF0ZSh2YWx1ZSkgfTtcbiAgICAgIH1cbiAgICAgIGtleSA9ICdfbGFzdF91c2VkJztcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3RpbWVzVXNlZCc6XG4gICAgICByZXR1cm4geyBrZXk6ICd0aW1lc191c2VkJywgdmFsdWU6IHZhbHVlIH07XG4gICAgZGVmYXVsdDoge1xuICAgICAgLy8gT3RoZXIgYXV0aCBkYXRhXG4gICAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0ga2V5Lm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKTtcbiAgICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgLy8gU3BlY2lhbC1jYXNlIGF1dGggZGF0YS5cbiAgICAgICAgcmV0dXJuIHsga2V5OiBgX2F1dGhfZGF0YV8ke3Byb3ZpZGVyfS5pZGAsIHZhbHVlIH07XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZXhwZWN0ZWRUeXBlSXNBcnJheSA9IHNjaGVtYSAmJiBzY2hlbWEuZmllbGRzW2tleV0gJiYgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdBcnJheSc7XG5cbiAgY29uc3QgZXhwZWN0ZWRUeXBlSXNQb2ludGVyID1cbiAgICBzY2hlbWEgJiYgc2NoZW1hLmZpZWxkc1trZXldICYmIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnUG9pbnRlcic7XG5cbiAgY29uc3QgZmllbGQgPSBzY2hlbWEgJiYgc2NoZW1hLmZpZWxkc1trZXldO1xuICBpZiAoXG4gICAgZXhwZWN0ZWRUeXBlSXNQb2ludGVyIHx8XG4gICAgKCFzY2hlbWEgJiYgIWtleS5pbmNsdWRlcygnLicpICYmIHZhbHVlICYmIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKVxuICApIHtcbiAgICBrZXkgPSAnX3BfJyArIGtleTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBxdWVyeSBjb25zdHJhaW50c1xuICBjb25zdCB0cmFuc2Zvcm1lZENvbnN0cmFpbnQgPSB0cmFuc2Zvcm1Db25zdHJhaW50KHZhbHVlLCBmaWVsZCwgY291bnQpO1xuICBpZiAodHJhbnNmb3JtZWRDb25zdHJhaW50ICE9PSBDYW5ub3RUcmFuc2Zvcm0pIHtcbiAgICBpZiAodHJhbnNmb3JtZWRDb25zdHJhaW50LiR0ZXh0KSB7XG4gICAgICByZXR1cm4geyBrZXk6ICckdGV4dCcsIHZhbHVlOiB0cmFuc2Zvcm1lZENvbnN0cmFpbnQuJHRleHQgfTtcbiAgICB9XG4gICAgaWYgKHRyYW5zZm9ybWVkQ29uc3RyYWludC4kZWxlbU1hdGNoKSB7XG4gICAgICByZXR1cm4geyBrZXk6ICckbm9yJywgdmFsdWU6IFt7IFtrZXldOiB0cmFuc2Zvcm1lZENvbnN0cmFpbnQgfV0gfTtcbiAgICB9XG4gICAgcmV0dXJuIHsga2V5LCB2YWx1ZTogdHJhbnNmb3JtZWRDb25zdHJhaW50IH07XG4gIH1cblxuICBpZiAoZXhwZWN0ZWRUeXBlSXNBcnJheSAmJiAhKHZhbHVlIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgcmV0dXJuIHsga2V5LCB2YWx1ZTogeyAkYWxsOiBbdHJhbnNmb3JtSW50ZXJpb3JBdG9tKHZhbHVlKV0gfSB9O1xuICB9XG5cbiAgLy8gSGFuZGxlIGF0b21pYyB2YWx1ZXNcbiAgY29uc3QgdHJhbnNmb3JtUmVzID0ga2V5LmluY2x1ZGVzKCcuJylcbiAgICA/IHRyYW5zZm9ybUludGVyaW9yQXRvbSh2YWx1ZSlcbiAgICA6IHRyYW5zZm9ybVRvcExldmVsQXRvbSh2YWx1ZSk7XG4gIGlmICh0cmFuc2Zvcm1SZXMgIT09IENhbm5vdFRyYW5zZm9ybSkge1xuICAgIHJldHVybiB7IGtleSwgdmFsdWU6IHRyYW5zZm9ybVJlcyB9O1xuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGBZb3UgY2Fubm90IHVzZSAke3ZhbHVlfSBhcyBhIHF1ZXJ5IHBhcmFtZXRlci5gXG4gICAgKTtcbiAgfVxufVxuXG4vLyBNYWluIGV4cG9zZWQgbWV0aG9kIHRvIGhlbHAgcnVuIHF1ZXJpZXMuXG4vLyByZXN0V2hlcmUgaXMgdGhlIFwid2hlcmVcIiBjbGF1c2UgaW4gUkVTVCBBUEkgZm9ybS5cbi8vIFJldHVybnMgdGhlIG1vbmdvIGZvcm0gb2YgdGhlIHF1ZXJ5LlxuZnVuY3Rpb24gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCByZXN0V2hlcmUsIHNjaGVtYSwgY291bnQgPSBmYWxzZSkge1xuICBjb25zdCBtb25nb1doZXJlID0ge307XG4gIGZvciAoY29uc3QgcmVzdEtleSBpbiByZXN0V2hlcmUpIHtcbiAgICBjb25zdCBvdXQgPSB0cmFuc2Zvcm1RdWVyeUtleVZhbHVlKGNsYXNzTmFtZSwgcmVzdEtleSwgcmVzdFdoZXJlW3Jlc3RLZXldLCBzY2hlbWEsIGNvdW50KTtcbiAgICBtb25nb1doZXJlW291dC5rZXldID0gb3V0LnZhbHVlO1xuICB9XG4gIHJldHVybiBtb25nb1doZXJlO1xufVxuXG5jb25zdCBwYXJzZU9iamVjdEtleVZhbHVlVG9Nb25nb09iamVjdEtleVZhbHVlID0gKHJlc3RLZXksIHJlc3RWYWx1ZSwgc2NoZW1hKSA9PiB7XG4gIC8vIENoZWNrIGlmIHRoZSBzY2hlbWEgaXMga25vd24gc2luY2UgaXQncyBhIGJ1aWx0LWluIGZpZWxkLlxuICBsZXQgdHJhbnNmb3JtZWRWYWx1ZTtcbiAgbGV0IGNvZXJjZWRUb0RhdGU7XG4gIHN3aXRjaCAocmVzdEtleSkge1xuICAgIGNhc2UgJ29iamVjdElkJzpcbiAgICAgIHJldHVybiB7IGtleTogJ19pZCcsIHZhbHVlOiByZXN0VmFsdWUgfTtcbiAgICBjYXNlICdleHBpcmVzQXQnOlxuICAgICAgdHJhbnNmb3JtZWRWYWx1ZSA9IHRyYW5zZm9ybVRvcExldmVsQXRvbShyZXN0VmFsdWUpO1xuICAgICAgY29lcmNlZFRvRGF0ZSA9XG4gICAgICAgIHR5cGVvZiB0cmFuc2Zvcm1lZFZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBEYXRlKHRyYW5zZm9ybWVkVmFsdWUpIDogdHJhbnNmb3JtZWRWYWx1ZTtcbiAgICAgIHJldHVybiB7IGtleTogJ2V4cGlyZXNBdCcsIHZhbHVlOiBjb2VyY2VkVG9EYXRlIH07XG4gICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIHRyYW5zZm9ybWVkVmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgICAgIGNvZXJjZWRUb0RhdGUgPVxuICAgICAgICB0eXBlb2YgdHJhbnNmb3JtZWRWYWx1ZSA9PT0gJ3N0cmluZycgPyBuZXcgRGF0ZSh0cmFuc2Zvcm1lZFZhbHVlKSA6IHRyYW5zZm9ybWVkVmFsdWU7XG4gICAgICByZXR1cm4geyBrZXk6ICdfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQnLCB2YWx1ZTogY29lcmNlZFRvRGF0ZSB9O1xuICAgIGNhc2UgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSkgOiB0cmFuc2Zvcm1lZFZhbHVlO1xuICAgICAgcmV0dXJuIHsga2V5OiAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgIHRyYW5zZm9ybWVkVmFsdWUgPSB0cmFuc2Zvcm1Ub3BMZXZlbEF0b20ocmVzdFZhbHVlKTtcbiAgICAgIGNvZXJjZWRUb0RhdGUgPVxuICAgICAgICB0eXBlb2YgdHJhbnNmb3JtZWRWYWx1ZSA9PT0gJ3N0cmluZycgPyBuZXcgRGF0ZSh0cmFuc2Zvcm1lZFZhbHVlKSA6IHRyYW5zZm9ybWVkVmFsdWU7XG4gICAgICByZXR1cm4geyBrZXk6ICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JywgdmFsdWU6IGNvZXJjZWRUb0RhdGUgfTtcbiAgICBjYXNlICdfcGFzc3dvcmRfY2hhbmdlZF9hdCc6XG4gICAgICB0cmFuc2Zvcm1lZFZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gICAgICBjb2VyY2VkVG9EYXRlID1cbiAgICAgICAgdHlwZW9mIHRyYW5zZm9ybWVkVmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IERhdGUodHJhbnNmb3JtZWRWYWx1ZSkgOiB0cmFuc2Zvcm1lZFZhbHVlO1xuICAgICAgcmV0dXJuIHsga2V5OiAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnLCB2YWx1ZTogY29lcmNlZFRvRGF0ZSB9O1xuICAgIGNhc2UgJ19mYWlsZWRfbG9naW5fY291bnQnOlxuICAgIGNhc2UgJ19ycGVybSc6XG4gICAgY2FzZSAnX3dwZXJtJzpcbiAgICBjYXNlICdfZW1haWxfdmVyaWZ5X3Rva2VuJzpcbiAgICBjYXNlICdfaGFzaGVkX3Bhc3N3b3JkJzpcbiAgICBjYXNlICdfcGVyaXNoYWJsZV90b2tlbic6XG4gICAgICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlOiByZXN0VmFsdWUgfTtcbiAgICBjYXNlICdzZXNzaW9uVG9rZW4nOlxuICAgICAgcmV0dXJuIHsga2V5OiAnX3Nlc3Npb25fdG9rZW4nLCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIEF1dGggZGF0YSBzaG91bGQgaGF2ZSBiZWVuIHRyYW5zZm9ybWVkIGFscmVhZHlcbiAgICAgIGlmIChyZXN0S2V5Lm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgJ2NhbiBvbmx5IHF1ZXJ5IG9uICcgKyByZXN0S2V5KTtcbiAgICAgIH1cbiAgICAgIC8vIFRydXN0IHRoYXQgdGhlIGF1dGggZGF0YSBoYXMgYmVlbiB0cmFuc2Zvcm1lZCBhbmQgc2F2ZSBpdCBkaXJlY3RseVxuICAgICAgaWYgKHJlc3RLZXkubWF0Y2goL15fYXV0aF9kYXRhX1thLXpBLVowLTlfXSskLykpIHtcbiAgICAgICAgcmV0dXJuIHsga2V5OiByZXN0S2V5LCB2YWx1ZTogcmVzdFZhbHVlIH07XG4gICAgICB9XG4gIH1cbiAgLy9za2lwIHN0cmFpZ2h0IHRvIHRyYW5zZm9ybVRvcExldmVsQXRvbSBmb3IgQnl0ZXMsIHRoZXkgZG9uJ3Qgc2hvdyB1cCBpbiB0aGUgc2NoZW1hIGZvciBzb21lIHJlYXNvblxuICBpZiAocmVzdFZhbHVlICYmIHJlc3RWYWx1ZS5fX3R5cGUgIT09ICdCeXRlcycpIHtcbiAgICAvL05vdGU6IFdlIG1heSBub3Qga25vdyB0aGUgdHlwZSBvZiBhIGZpZWxkIGhlcmUsIGFzIHRoZSB1c2VyIGNvdWxkIGJlIHNhdmluZyAobnVsbCkgdG8gYSBmaWVsZFxuICAgIC8vVGhhdCBuZXZlciBleGlzdGVkIGJlZm9yZSwgbWVhbmluZyB3ZSBjYW4ndCBpbmZlciB0aGUgdHlwZS5cbiAgICBpZiAoXG4gICAgICAoc2NoZW1hLmZpZWxkc1tyZXN0S2V5XSAmJiBzY2hlbWEuZmllbGRzW3Jlc3RLZXldLnR5cGUgPT0gJ1BvaW50ZXInKSB8fFxuICAgICAgcmVzdFZhbHVlLl9fdHlwZSA9PSAnUG9pbnRlcidcbiAgICApIHtcbiAgICAgIHJlc3RLZXkgPSAnX3BfJyArIHJlc3RLZXk7XG4gICAgfVxuICB9XG5cbiAgLy8gSGFuZGxlIGF0b21pYyB2YWx1ZXNcbiAgdmFyIHZhbHVlID0gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKHJlc3RWYWx1ZSk7XG4gIGlmICh2YWx1ZSAhPT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgcmV0dXJuIHsga2V5OiByZXN0S2V5LCB2YWx1ZTogdmFsdWUgfTtcbiAgfVxuXG4gIC8vIEFDTHMgYXJlIGhhbmRsZWQgYmVmb3JlIHRoaXMgbWV0aG9kIGlzIGNhbGxlZFxuICAvLyBJZiBhbiBBQ0wga2V5IHN0aWxsIGV4aXN0cyBoZXJlLCBzb21ldGhpbmcgaXMgd3JvbmcuXG4gIGlmIChyZXN0S2V5ID09PSAnQUNMJykge1xuICAgIHRocm93ICdUaGVyZSB3YXMgYSBwcm9ibGVtIHRyYW5zZm9ybWluZyBhbiBBQ0wuJztcbiAgfVxuXG4gIC8vIEhhbmRsZSBhcnJheXNcbiAgaWYgKHJlc3RWYWx1ZSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgdmFsdWUgPSByZXN0VmFsdWUubWFwKHRyYW5zZm9ybUludGVyaW9yVmFsdWUpO1xuICAgIHJldHVybiB7IGtleTogcmVzdEtleSwgdmFsdWU6IHZhbHVlIH07XG4gIH1cblxuICAvLyBIYW5kbGUgbm9ybWFsIG9iamVjdHMgYnkgcmVjdXJzaW5nXG4gIGlmIChPYmplY3Qua2V5cyhyZXN0VmFsdWUpLnNvbWUoa2V5ID0+IGtleS5pbmNsdWRlcygnJCcpIHx8IGtleS5pbmNsdWRlcygnLicpKSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICk7XG4gIH1cbiAgdmFsdWUgPSBtYXBWYWx1ZXMocmVzdFZhbHVlLCB0cmFuc2Zvcm1JbnRlcmlvclZhbHVlKTtcblxuICByZXR1cm4geyBrZXk6IHJlc3RLZXksIHZhbHVlIH07XG59O1xuXG5jb25zdCBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUgPSAoY2xhc3NOYW1lLCByZXN0Q3JlYXRlLCBzY2hlbWEpID0+IHtcbiAgcmVzdENyZWF0ZSA9IGFkZExlZ2FjeUFDTChyZXN0Q3JlYXRlKTtcbiAgY29uc3QgbW9uZ29DcmVhdGUgPSB7fTtcbiAgZm9yIChjb25zdCByZXN0S2V5IGluIHJlc3RDcmVhdGUpIHtcbiAgICBpZiAocmVzdENyZWF0ZVtyZXN0S2V5XSAmJiByZXN0Q3JlYXRlW3Jlc3RLZXldLl9fdHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IHsga2V5LCB2YWx1ZSB9ID0gcGFyc2VPYmplY3RLZXlWYWx1ZVRvTW9uZ29PYmplY3RLZXlWYWx1ZShcbiAgICAgIHJlc3RLZXksXG4gICAgICByZXN0Q3JlYXRlW3Jlc3RLZXldLFxuICAgICAgc2NoZW1hXG4gICAgKTtcbiAgICBpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgbW9uZ29DcmVhdGVba2V5XSA9IHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIC8vIFVzZSB0aGUgbGVnYWN5IG1vbmdvIGZvcm1hdCBmb3IgY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXRcbiAgaWYgKG1vbmdvQ3JlYXRlLmNyZWF0ZWRBdCkge1xuICAgIG1vbmdvQ3JlYXRlLl9jcmVhdGVkX2F0ID0gbmV3IERhdGUobW9uZ29DcmVhdGUuY3JlYXRlZEF0LmlzbyB8fCBtb25nb0NyZWF0ZS5jcmVhdGVkQXQpO1xuICAgIGRlbGV0ZSBtb25nb0NyZWF0ZS5jcmVhdGVkQXQ7XG4gIH1cbiAgaWYgKG1vbmdvQ3JlYXRlLnVwZGF0ZWRBdCkge1xuICAgIG1vbmdvQ3JlYXRlLl91cGRhdGVkX2F0ID0gbmV3IERhdGUobW9uZ29DcmVhdGUudXBkYXRlZEF0LmlzbyB8fCBtb25nb0NyZWF0ZS51cGRhdGVkQXQpO1xuICAgIGRlbGV0ZSBtb25nb0NyZWF0ZS51cGRhdGVkQXQ7XG4gIH1cblxuICByZXR1cm4gbW9uZ29DcmVhdGU7XG59O1xuXG4vLyBNYWluIGV4cG9zZWQgbWV0aG9kIHRvIGhlbHAgdXBkYXRlIG9sZCBvYmplY3RzLlxuY29uc3QgdHJhbnNmb3JtVXBkYXRlID0gKGNsYXNzTmFtZSwgcmVzdFVwZGF0ZSwgcGFyc2VGb3JtYXRTY2hlbWEpID0+IHtcbiAgY29uc3QgbW9uZ29VcGRhdGUgPSB7fTtcbiAgY29uc3QgYWNsID0gYWRkTGVnYWN5QUNMKHJlc3RVcGRhdGUpO1xuICBpZiAoYWNsLl9ycGVybSB8fCBhY2wuX3dwZXJtIHx8IGFjbC5fYWNsKSB7XG4gICAgbW9uZ29VcGRhdGUuJHNldCA9IHt9O1xuICAgIGlmIChhY2wuX3JwZXJtKSB7XG4gICAgICBtb25nb1VwZGF0ZS4kc2V0Ll9ycGVybSA9IGFjbC5fcnBlcm07XG4gICAgfVxuICAgIGlmIChhY2wuX3dwZXJtKSB7XG4gICAgICBtb25nb1VwZGF0ZS4kc2V0Ll93cGVybSA9IGFjbC5fd3Blcm07XG4gICAgfVxuICAgIGlmIChhY2wuX2FjbCkge1xuICAgICAgbW9uZ29VcGRhdGUuJHNldC5fYWNsID0gYWNsLl9hY2w7XG4gICAgfVxuICB9XG4gIGZvciAodmFyIHJlc3RLZXkgaW4gcmVzdFVwZGF0ZSkge1xuICAgIGlmIChyZXN0VXBkYXRlW3Jlc3RLZXldICYmIHJlc3RVcGRhdGVbcmVzdEtleV0uX190eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgdmFyIG91dCA9IHRyYW5zZm9ybUtleVZhbHVlRm9yVXBkYXRlKFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgcmVzdEtleSxcbiAgICAgIHJlc3RVcGRhdGVbcmVzdEtleV0sXG4gICAgICBwYXJzZUZvcm1hdFNjaGVtYVxuICAgICk7XG5cbiAgICAvLyBJZiB0aGUgb3V0cHV0IHZhbHVlIGlzIGFuIG9iamVjdCB3aXRoIGFueSAkIGtleXMsIGl0J3MgYW5cbiAgICAvLyBvcGVyYXRvciB0aGF0IG5lZWRzIHRvIGJlIGxpZnRlZCBvbnRvIHRoZSB0b3AgbGV2ZWwgdXBkYXRlXG4gICAgLy8gb2JqZWN0LlxuICAgIGlmICh0eXBlb2Ygb3V0LnZhbHVlID09PSAnb2JqZWN0JyAmJiBvdXQudmFsdWUgIT09IG51bGwgJiYgb3V0LnZhbHVlLl9fb3ApIHtcbiAgICAgIG1vbmdvVXBkYXRlW291dC52YWx1ZS5fX29wXSA9IG1vbmdvVXBkYXRlW291dC52YWx1ZS5fX29wXSB8fCB7fTtcbiAgICAgIG1vbmdvVXBkYXRlW291dC52YWx1ZS5fX29wXVtvdXQua2V5XSA9IG91dC52YWx1ZS5hcmc7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1vbmdvVXBkYXRlWyckc2V0J10gPSBtb25nb1VwZGF0ZVsnJHNldCddIHx8IHt9O1xuICAgICAgbW9uZ29VcGRhdGVbJyRzZXQnXVtvdXQua2V5XSA9IG91dC52YWx1ZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbW9uZ29VcGRhdGU7XG59O1xuXG4vLyBBZGQgdGhlIGxlZ2FjeSBfYWNsIGZvcm1hdC5cbmNvbnN0IGFkZExlZ2FjeUFDTCA9IHJlc3RPYmplY3QgPT4ge1xuICBjb25zdCByZXN0T2JqZWN0Q29weSA9IHsgLi4ucmVzdE9iamVjdCB9O1xuICBjb25zdCBfYWNsID0ge307XG5cbiAgaWYgKHJlc3RPYmplY3QuX3dwZXJtKSB7XG4gICAgcmVzdE9iamVjdC5fd3Blcm0uZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBfYWNsW2VudHJ5XSA9IHsgdzogdHJ1ZSB9O1xuICAgIH0pO1xuICAgIHJlc3RPYmplY3RDb3B5Ll9hY2wgPSBfYWNsO1xuICB9XG5cbiAgaWYgKHJlc3RPYmplY3QuX3JwZXJtKSB7XG4gICAgcmVzdE9iamVjdC5fcnBlcm0uZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIShlbnRyeSBpbiBfYWNsKSkge1xuICAgICAgICBfYWNsW2VudHJ5XSA9IHsgcjogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgX2FjbFtlbnRyeV0uciA9IHRydWU7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmVzdE9iamVjdENvcHkuX2FjbCA9IF9hY2w7XG4gIH1cblxuICByZXR1cm4gcmVzdE9iamVjdENvcHk7XG59O1xuXG4vLyBBIHNlbnRpbmVsIHZhbHVlIHRoYXQgaGVscGVyIHRyYW5zZm9ybWF0aW9ucyByZXR1cm4gd2hlbiB0aGV5XG4vLyBjYW5ub3QgcGVyZm9ybSBhIHRyYW5zZm9ybWF0aW9uXG5mdW5jdGlvbiBDYW5ub3RUcmFuc2Zvcm0oKSB7fVxuXG5jb25zdCB0cmFuc2Zvcm1JbnRlcmlvckF0b20gPSBhdG9tID0+IHtcbiAgLy8gVE9ETzogY2hlY2sgdmFsaWRpdHkgaGFyZGVyIGZvciB0aGUgX190eXBlLWRlZmluZWQgdHlwZXNcbiAgaWYgKHR5cGVvZiBhdG9tID09PSAnb2JqZWN0JyAmJiBhdG9tICYmICEoYXRvbSBpbnN0YW5jZW9mIERhdGUpICYmIGF0b20uX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6IGF0b20uY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IGF0b20ub2JqZWN0SWQsXG4gICAgfTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgYXRvbSA9PT0gJ2Z1bmN0aW9uJyB8fCB0eXBlb2YgYXRvbSA9PT0gJ3N5bWJvbCcpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgY2Fubm90IHRyYW5zZm9ybSB2YWx1ZTogJHthdG9tfWApO1xuICB9IGVsc2UgaWYgKERhdGVDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgIHJldHVybiBEYXRlQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gIH0gZWxzZSBpZiAoQnl0ZXNDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgIHJldHVybiBCeXRlc0NvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBhdG9tID09PSAnb2JqZWN0JyAmJiBhdG9tICYmIGF0b20uJHJlZ2V4ICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gbmV3IFJlZ0V4cChhdG9tLiRyZWdleCk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGF0b207XG4gIH1cbn07XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byB0cmFuc2Zvcm0gYW4gYXRvbSBmcm9tIFJFU1QgZm9ybWF0IHRvIE1vbmdvIGZvcm1hdC5cbi8vIEFuIGF0b20gaXMgYW55dGhpbmcgdGhhdCBjYW4ndCBjb250YWluIG90aGVyIGV4cHJlc3Npb25zLiBTbyBpdFxuLy8gaW5jbHVkZXMgdGhpbmdzIHdoZXJlIG9iamVjdHMgYXJlIHVzZWQgdG8gcmVwcmVzZW50IG90aGVyXG4vLyBkYXRhdHlwZXMsIGxpa2UgcG9pbnRlcnMgYW5kIGRhdGVzLCBidXQgaXQgZG9lcyBub3QgaW5jbHVkZSBvYmplY3RzXG4vLyBvciBhcnJheXMgd2l0aCBnZW5lcmljIHN0dWZmIGluc2lkZS5cbi8vIFJhaXNlcyBhbiBlcnJvciBpZiB0aGlzIGNhbm5vdCBwb3NzaWJseSBiZSB2YWxpZCBSRVNUIGZvcm1hdC5cbi8vIFJldHVybnMgQ2Fubm90VHJhbnNmb3JtIGlmIGl0J3MganVzdCBub3QgYW4gYXRvbVxuZnVuY3Rpb24gdHJhbnNmb3JtVG9wTGV2ZWxBdG9tKGF0b20sIGZpZWxkKSB7XG4gIHN3aXRjaCAodHlwZW9mIGF0b20pIHtcbiAgICBjYXNlICdudW1iZXInOlxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgICByZXR1cm4gYXRvbTtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgaWYgKGZpZWxkICYmIGZpZWxkLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm4gYCR7ZmllbGQudGFyZ2V0Q2xhc3N9JCR7YXRvbX1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGF0b207XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgY2Fubm90IHRyYW5zZm9ybSB2YWx1ZTogJHthdG9tfWApO1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAoYXRvbSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgLy8gVGVjaG5pY2FsbHkgZGF0ZXMgYXJlIG5vdCByZXN0IGZvcm1hdCwgYnV0LCBpdCBzZWVtcyBwcmV0dHlcbiAgICAgICAgLy8gY2xlYXIgd2hhdCB0aGV5IHNob3VsZCBiZSB0cmFuc2Zvcm1lZCB0bywgc28gbGV0J3MganVzdCBkbyBpdC5cbiAgICAgICAgcmV0dXJuIGF0b207XG4gICAgICB9XG5cbiAgICAgIGlmIChhdG9tID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBhdG9tO1xuICAgICAgfVxuXG4gICAgICAvLyBUT0RPOiBjaGVjayB2YWxpZGl0eSBoYXJkZXIgZm9yIHRoZSBfX3R5cGUtZGVmaW5lZCB0eXBlc1xuICAgICAgaWYgKGF0b20uX190eXBlID09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm4gYCR7YXRvbS5jbGFzc05hbWV9JCR7YXRvbS5vYmplY3RJZH1gO1xuICAgICAgfVxuICAgICAgaWYgKERhdGVDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gRGF0ZUNvZGVyLkpTT05Ub0RhdGFiYXNlKGF0b20pO1xuICAgICAgfVxuICAgICAgaWYgKEJ5dGVzQ29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICAgICAgcmV0dXJuIEJ5dGVzQ29kZXIuSlNPTlRvRGF0YWJhc2UoYXRvbSk7XG4gICAgICB9XG4gICAgICBpZiAoR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihhdG9tKSkge1xuICAgICAgICByZXR1cm4gR2VvUG9pbnRDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgICAgIH1cbiAgICAgIGlmIChQb2x5Z29uQ29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICAgICAgcmV0dXJuIFBvbHlnb25Db2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgICAgIH1cbiAgICAgIGlmIChGaWxlQ29kZXIuaXNWYWxpZEpTT04oYXRvbSkpIHtcbiAgICAgICAgcmV0dXJuIEZpbGVDb2Rlci5KU09OVG9EYXRhYmFzZShhdG9tKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBDYW5ub3RUcmFuc2Zvcm07XG5cbiAgICBkZWZhdWx0OlxuICAgICAgLy8gSSBkb24ndCB0aGluayB0eXBlb2YgY2FuIGV2ZXIgbGV0IHVzIGdldCBoZXJlXG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgYHJlYWxseSBkaWQgbm90IGV4cGVjdCB2YWx1ZTogJHthdG9tfWBcbiAgICAgICk7XG4gIH1cbn1cblxuLy8gVHJhbnNmb3JtcyBhIHF1ZXJ5IGNvbnN0cmFpbnQgZnJvbSBSRVNUIEFQSSBmb3JtYXQgdG8gTW9uZ28gZm9ybWF0LlxuLy8gQSBjb25zdHJhaW50IGlzIHNvbWV0aGluZyB3aXRoIGZpZWxkcyBsaWtlICRsdC5cbi8vIElmIGl0IGlzIG5vdCBhIHZhbGlkIGNvbnN0cmFpbnQgYnV0IGl0IGNvdWxkIGJlIGEgdmFsaWQgc29tZXRoaW5nXG4vLyBlbHNlLCByZXR1cm4gQ2Fubm90VHJhbnNmb3JtLlxuLy8gaW5BcnJheSBpcyB3aGV0aGVyIHRoaXMgaXMgYW4gYXJyYXkgZmllbGQuXG5mdW5jdGlvbiB0cmFuc2Zvcm1Db25zdHJhaW50KGNvbnN0cmFpbnQsIGZpZWxkLCBjb3VudCA9IGZhbHNlKSB7XG4gIGNvbnN0IGluQXJyYXkgPSBmaWVsZCAmJiBmaWVsZC50eXBlICYmIGZpZWxkLnR5cGUgPT09ICdBcnJheSc7XG4gIGlmICh0eXBlb2YgY29uc3RyYWludCAhPT0gJ29iamVjdCcgfHwgIWNvbnN0cmFpbnQpIHtcbiAgICByZXR1cm4gQ2Fubm90VHJhbnNmb3JtO1xuICB9XG4gIGNvbnN0IHRyYW5zZm9ybUZ1bmN0aW9uID0gaW5BcnJheSA/IHRyYW5zZm9ybUludGVyaW9yQXRvbSA6IHRyYW5zZm9ybVRvcExldmVsQXRvbTtcbiAgY29uc3QgdHJhbnNmb3JtZXIgPSBhdG9tID0+IHtcbiAgICBjb25zdCByZXN1bHQgPSB0cmFuc2Zvcm1GdW5jdGlvbihhdG9tLCBmaWVsZCk7XG4gICAgaWYgKHJlc3VsdCA9PT0gQ2Fubm90VHJhbnNmb3JtKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkIGF0b206ICR7SlNPTi5zdHJpbmdpZnkoYXRvbSl9YCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG4gIC8vIGtleXMgaXMgdGhlIGNvbnN0cmFpbnRzIGluIHJldmVyc2UgYWxwaGFiZXRpY2FsIG9yZGVyLlxuICAvLyBUaGlzIGlzIGEgaGFjayBzbyB0aGF0OlxuICAvLyAgICRyZWdleCBpcyBoYW5kbGVkIGJlZm9yZSAkb3B0aW9uc1xuICAvLyAgICRuZWFyU3BoZXJlIGlzIGhhbmRsZWQgYmVmb3JlICRtYXhEaXN0YW5jZVxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGNvbnN0cmFpbnQpLnNvcnQoKS5yZXZlcnNlKCk7XG4gIHZhciBhbnN3ZXIgPSB7fTtcbiAgZm9yICh2YXIga2V5IG9mIGtleXMpIHtcbiAgICBzd2l0Y2ggKGtleSkge1xuICAgICAgY2FzZSAnJGx0JzpcbiAgICAgIGNhc2UgJyRsdGUnOlxuICAgICAgY2FzZSAnJGd0JzpcbiAgICAgIGNhc2UgJyRndGUnOlxuICAgICAgY2FzZSAnJGV4aXN0cyc6XG4gICAgICBjYXNlICckbmUnOlxuICAgICAgY2FzZSAnJGVxJzoge1xuICAgICAgICBjb25zdCB2YWwgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICh2YWwgJiYgdHlwZW9mIHZhbCA9PT0gJ29iamVjdCcgJiYgdmFsLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSAhPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIERhdGUgZmllbGQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgICAgICBjYXNlICckZXhpc3RzJzpcbiAgICAgICAgICAgIGNhc2UgJyRuZSc6XG4gICAgICAgICAgICBjYXNlICckZXEnOlxuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCB0aGUgJGx0LCAkbHRlLCAkZ3QsIGFuZCAkZ3RlIG9wZXJhdG9ycydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBwYXJzZXJSZXN1bHQgPSBVdGlscy5yZWxhdGl2ZVRpbWVUb0RhdGUodmFsLiRyZWxhdGl2ZVRpbWUpO1xuICAgICAgICAgIGlmIChwYXJzZXJSZXN1bHQuc3RhdHVzID09PSAnc3VjY2VzcycpIHtcbiAgICAgICAgICAgIGFuc3dlcltrZXldID0gcGFyc2VyUmVzdWx0LnJlc3VsdDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGxvZy5pbmZvKCdFcnJvciB3aGlsZSBwYXJzaW5nIHJlbGF0aXZlIGRhdGUnLCBwYXJzZXJSZXN1bHQpO1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGBiYWQgJHJlbGF0aXZlVGltZSAoJHtrZXl9KSB2YWx1ZS4gJHtwYXJzZXJSZXN1bHQuaW5mb31gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGFuc3dlcltrZXldID0gdHJhbnNmb3JtZXIodmFsKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGNhc2UgJyRpbic6XG4gICAgICBjYXNlICckbmluJzoge1xuICAgICAgICBjb25zdCBhcnIgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJyArIGtleSArICcgdmFsdWUnKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IF8uZmxhdE1hcChhcnIsIHZhbHVlID0+IHtcbiAgICAgICAgICByZXR1cm4gKGF0b20gPT4ge1xuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYXRvbSkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm1hcCh0cmFuc2Zvcm1lcik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gdHJhbnNmb3JtZXIoYXRvbSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSkodmFsdWUpO1xuICAgICAgICB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckYWxsJzoge1xuICAgICAgICBjb25zdCBhcnIgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJyArIGtleSArICcgdmFsdWUnKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IGFyci5tYXAodHJhbnNmb3JtSW50ZXJpb3JBdG9tKTtcblxuICAgICAgICBjb25zdCB2YWx1ZXMgPSBhbnN3ZXJba2V5XTtcbiAgICAgICAgaWYgKGlzQW55VmFsdWVSZWdleCh2YWx1ZXMpICYmICFpc0FsbFZhbHVlc1JlZ2V4T3JOb25lKHZhbHVlcykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnQWxsICRhbGwgdmFsdWVzIG11c3QgYmUgb2YgcmVnZXggdHlwZSBvciBub25lOiAnICsgdmFsdWVzXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJHJlZ2V4JzpcbiAgICAgICAgdmFyIHMgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICh0eXBlb2YgcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkIHJlZ2V4OiAnICsgcyk7XG4gICAgICAgIH1cbiAgICAgICAgYW5zd2VyW2tleV0gPSBzO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJGNvbnRhaW5lZEJ5Jzoge1xuICAgICAgICBjb25zdCBhcnIgPSBjb25zdHJhaW50W2tleV07XG4gICAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJGNvbnRhaW5lZEJ5OiBzaG91bGQgYmUgYW4gYXJyYXlgKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXIuJGVsZW1NYXRjaCA9IHtcbiAgICAgICAgICAkbmluOiBhcnIubWFwKHRyYW5zZm9ybWVyKSxcbiAgICAgICAgfTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckb3B0aW9ucyc6XG4gICAgICAgIGFuc3dlcltrZXldID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnJHRleHQnOiB7XG4gICAgICAgIGNvbnN0IHNlYXJjaCA9IGNvbnN0cmFpbnRba2V5XS4kc2VhcmNoO1xuICAgICAgICBpZiAodHlwZW9mIHNlYXJjaCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkc2VhcmNoLCBzaG91bGQgYmUgb2JqZWN0YCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFzZWFyY2guJHRlcm0gfHwgdHlwZW9mIHNlYXJjaC4kdGVybSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkdGVybSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICAgJHNlYXJjaDogc2VhcmNoLiR0ZXJtLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UgJiYgdHlwZW9mIHNlYXJjaC4kbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJGxhbmd1YWdlLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRsYW5ndWFnZSkge1xuICAgICAgICAgIGFuc3dlcltrZXldLiRsYW5ndWFnZSA9IHNlYXJjaC4kbGFuZ3VhZ2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgICBhbnN3ZXJba2V5XS4kY2FzZVNlbnNpdGl2ZSA9IHNlYXJjaC4kY2FzZVNlbnNpdGl2ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlKSB7XG4gICAgICAgICAgYW5zd2VyW2tleV0uJGRpYWNyaXRpY1NlbnNpdGl2ZSA9IHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJG5lYXJTcGhlcmUnOiB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICBhbnN3ZXIuJGdlb1dpdGhpbiA9IHtcbiAgICAgICAgICAgICRjZW50ZXJTcGhlcmU6IFtbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV0sIGNvbnN0cmFpbnQuJG1heERpc3RhbmNlXSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFuc3dlcltrZXldID0gW3BvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGVdO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnJG1heERpc3RhbmNlJzoge1xuICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IGNvbnN0cmFpbnRba2V5XTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICAvLyBUaGUgU0RLcyBkb24ndCBzZWVtIHRvIHVzZSB0aGVzZSBidXQgdGhleSBhcmUgZG9jdW1lbnRlZCBpbiB0aGVcbiAgICAgIC8vIFJFU1QgQVBJIGRvY3MuXG4gICAgICBjYXNlICckbWF4RGlzdGFuY2VJblJhZGlhbnMnOlxuICAgICAgICBhbnN3ZXJbJyRtYXhEaXN0YW5jZSddID0gY29uc3RyYWludFtrZXldO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJyRtYXhEaXN0YW5jZUluTWlsZXMnOlxuICAgICAgICBhbnN3ZXJbJyRtYXhEaXN0YW5jZSddID0gY29uc3RyYWludFtrZXldIC8gMzk1OTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICckbWF4RGlzdGFuY2VJbktpbG9tZXRlcnMnOlxuICAgICAgICBhbnN3ZXJbJyRtYXhEaXN0YW5jZSddID0gY29uc3RyYWludFtrZXldIC8gNjM3MTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJyRzZWxlY3QnOlxuICAgICAgY2FzZSAnJGRvbnRTZWxlY3QnOlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAndGhlICcgKyBrZXkgKyAnIGNvbnN0cmFpbnQgaXMgbm90IHN1cHBvcnRlZCB5ZXQnXG4gICAgICAgICk7XG5cbiAgICAgIGNhc2UgJyR3aXRoaW4nOlxuICAgICAgICB2YXIgYm94ID0gY29uc3RyYWludFtrZXldWyckYm94J107XG4gICAgICAgIGlmICghYm94IHx8IGJveC5sZW5ndGggIT0gMikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdtYWxmb3JtYXR0ZWQgJHdpdGhpbiBhcmcnKTtcbiAgICAgICAgfVxuICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAkYm94OiBbXG4gICAgICAgICAgICBbYm94WzBdLmxvbmdpdHVkZSwgYm94WzBdLmxhdGl0dWRlXSxcbiAgICAgICAgICAgIFtib3hbMV0ubG9uZ2l0dWRlLCBib3hbMV0ubGF0aXR1ZGVdLFxuICAgICAgICAgIF0sXG4gICAgICAgIH07XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICckZ2VvV2l0aGluJzoge1xuICAgICAgICBjb25zdCBwb2x5Z29uID0gY29uc3RyYWludFtrZXldWyckcG9seWdvbiddO1xuICAgICAgICBjb25zdCBjZW50ZXJTcGhlcmUgPSBjb25zdHJhaW50W2tleV1bJyRjZW50ZXJTcGhlcmUnXTtcbiAgICAgICAgaWYgKHBvbHlnb24gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGxldCBwb2ludHM7XG4gICAgICAgICAgaWYgKHR5cGVvZiBwb2x5Z29uID09PSAnb2JqZWN0JyAmJiBwb2x5Z29uLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgICAgICBpZiAoIXBvbHlnb24uY29vcmRpbmF0ZXMgfHwgcG9seWdvbi5jb29yZGluYXRlcy5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyBQb2x5Z29uLmNvb3JkaW5hdGVzIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgbG9uL2xhdCBwYWlycydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBvaW50cyA9IHBvbHlnb24uY29vcmRpbmF0ZXM7XG4gICAgICAgICAgfSBlbHNlIGlmIChwb2x5Z29uIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICAgIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgR2VvUG9pbnRzJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcG9pbnRzID0gcG9seWdvbjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgIFwiYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBiZSBQb2x5Z29uIG9iamVjdCBvciBBcnJheSBvZiBQYXJzZS5HZW9Qb2ludCdzXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHBvaW50cyA9IHBvaW50cy5tYXAocG9pbnQgPT4ge1xuICAgICAgICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgICAgICAgICByZXR1cm4gcG9pbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGdlb1dpdGhpbiB2YWx1ZScpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFtwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlXTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBhbnN3ZXJba2V5XSA9IHtcbiAgICAgICAgICAgICRwb2x5Z29uOiBwb2ludHMsXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIGlmIChjZW50ZXJTcGhlcmUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmICghKGNlbnRlclNwaGVyZSBpbnN0YW5jZW9mIEFycmF5KSB8fCBjZW50ZXJTcGhlcmUubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBzaG91bGQgYmUgYW4gYXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQgYW5kIGRpc3RhbmNlJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gR2V0IHBvaW50LCBjb252ZXJ0IHRvIGdlbyBwb2ludCBpZiBuZWNlc3NhcnkgYW5kIHZhbGlkYXRlXG4gICAgICAgICAgbGV0IHBvaW50ID0gY2VudGVyU3BoZXJlWzBdO1xuICAgICAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgcG9pbnQgPSBuZXcgUGFyc2UuR2VvUG9pbnQocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKCFHZW9Qb2ludENvZGVyLmlzVmFsaWRKU09OKHBvaW50KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBnZW8gcG9pbnQgaW52YWxpZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgICAvLyBHZXQgZGlzdGFuY2UgYW5kIHZhbGlkYXRlXG4gICAgICAgICAgY29uc3QgZGlzdGFuY2UgPSBjZW50ZXJTcGhlcmVbMV07XG4gICAgICAgICAgaWYgKGlzTmFOKGRpc3RhbmNlKSB8fCBkaXN0YW5jZSA8IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZGlzdGFuY2UgaW52YWxpZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICAgJGNlbnRlclNwaGVyZTogW1twb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlXSwgZGlzdGFuY2VdLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICckZ2VvSW50ZXJzZWN0cyc6IHtcbiAgICAgICAgY29uc3QgcG9pbnQgPSBjb25zdHJhaW50W2tleV1bJyRwb2ludCddO1xuICAgICAgICBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvSW50ZXJzZWN0IHZhbHVlOyAkcG9pbnQgc2hvdWxkIGJlIEdlb1BvaW50J1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgICB9XG4gICAgICAgIGFuc3dlcltrZXldID0ge1xuICAgICAgICAgICRnZW9tZXRyeToge1xuICAgICAgICAgICAgdHlwZTogJ1BvaW50JyxcbiAgICAgICAgICAgIGNvb3JkaW5hdGVzOiBbcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZV0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBpZiAoa2V5Lm1hdGNoKC9eXFwkKy8pKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCBjb25zdHJhaW50OiAnICsga2V5KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gQ2Fubm90VHJhbnNmb3JtO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYW5zd2VyO1xufVxuXG4vLyBUcmFuc2Zvcm1zIGFuIHVwZGF0ZSBvcGVyYXRvciBmcm9tIFJFU1QgZm9ybWF0IHRvIG1vbmdvIGZvcm1hdC5cbi8vIFRvIGJlIHRyYW5zZm9ybWVkLCB0aGUgaW5wdXQgc2hvdWxkIGhhdmUgYW4gX19vcCBmaWVsZC5cbi8vIElmIGZsYXR0ZW4gaXMgdHJ1ZSwgdGhpcyB3aWxsIGZsYXR0ZW4gb3BlcmF0b3JzIHRvIHRoZWlyIHN0YXRpY1xuLy8gZGF0YSBmb3JtYXQuIEZvciBleGFtcGxlLCBhbiBpbmNyZW1lbnQgb2YgMiB3b3VsZCBzaW1wbHkgYmVjb21lIGFcbi8vIDIuXG4vLyBUaGUgb3V0cHV0IGZvciBhIG5vbi1mbGF0dGVuZWQgb3BlcmF0b3IgaXMgYSBoYXNoIHdpdGggX19vcCBiZWluZ1xuLy8gdGhlIG1vbmdvIG9wLCBhbmQgYXJnIGJlaW5nIHRoZSBhcmd1bWVudC5cbi8vIFRoZSBvdXRwdXQgZm9yIGEgZmxhdHRlbmVkIG9wZXJhdG9yIGlzIGp1c3QgYSB2YWx1ZS5cbi8vIFJldHVybnMgdW5kZWZpbmVkIGlmIHRoaXMgc2hvdWxkIGJlIGEgbm8tb3AuXG5cbmZ1bmN0aW9uIHRyYW5zZm9ybVVwZGF0ZU9wZXJhdG9yKHsgX19vcCwgYW1vdW50LCBvYmplY3RzIH0sIGZsYXR0ZW4pIHtcbiAgc3dpdGNoIChfX29wKSB7XG4gICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgIGlmIChmbGF0dGVuKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geyBfX29wOiAnJHVuc2V0JywgYXJnOiAnJyB9O1xuICAgICAgfVxuXG4gICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgIGlmICh0eXBlb2YgYW1vdW50ICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnaW5jcmVtZW50aW5nIG11c3QgcHJvdmlkZSBhIG51bWJlcicpO1xuICAgICAgfVxuICAgICAgaWYgKGZsYXR0ZW4pIHtcbiAgICAgICAgcmV0dXJuIGFtb3VudDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7IF9fb3A6ICckaW5jJywgYXJnOiBhbW91bnQgfTtcbiAgICAgIH1cblxuICAgIGNhc2UgJ1NldE9uSW5zZXJ0JzpcbiAgICAgIGlmIChmbGF0dGVuKSB7XG4gICAgICAgIHJldHVybiBhbW91bnQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geyBfX29wOiAnJHNldE9uSW5zZXJ0JywgYXJnOiBhbW91bnQgfTtcbiAgICAgIH1cblxuICAgIGNhc2UgJ0FkZCc6XG4gICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgIGlmICghKG9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgIH1cbiAgICAgIHZhciB0b0FkZCA9IG9iamVjdHMubWFwKHRyYW5zZm9ybUludGVyaW9yQXRvbSk7XG4gICAgICBpZiAoZmxhdHRlbikge1xuICAgICAgICByZXR1cm4gdG9BZGQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgbW9uZ29PcCA9IHtcbiAgICAgICAgICBBZGQ6ICckcHVzaCcsXG4gICAgICAgICAgQWRkVW5pcXVlOiAnJGFkZFRvU2V0JyxcbiAgICAgICAgfVtfX29wXTtcbiAgICAgICAgcmV0dXJuIHsgX19vcDogbW9uZ29PcCwgYXJnOiB7ICRlYWNoOiB0b0FkZCB9IH07XG4gICAgICB9XG5cbiAgICBjYXNlICdSZW1vdmUnOlxuICAgICAgaWYgKCEob2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byByZW1vdmUgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgfVxuICAgICAgdmFyIHRvUmVtb3ZlID0gb2JqZWN0cy5tYXAodHJhbnNmb3JtSW50ZXJpb3JBdG9tKTtcbiAgICAgIGlmIChmbGF0dGVuKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB7IF9fb3A6ICckcHVsbEFsbCcsIGFyZzogdG9SZW1vdmUgfTtcbiAgICAgIH1cblxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLkNPTU1BTkRfVU5BVkFJTEFCTEUsXG4gICAgICAgIGBUaGUgJHtfX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICApO1xuICB9XG59XG5mdW5jdGlvbiBtYXBWYWx1ZXMob2JqZWN0LCBpdGVyYXRvcikge1xuICBjb25zdCByZXN1bHQgPSB7fTtcbiAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgcmVzdWx0W2tleV0gPSBpdGVyYXRvcihvYmplY3Rba2V5XSk7XG4gIH0pO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG5jb25zdCBuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QgPSBtb25nb09iamVjdCA9PiB7XG4gIHN3aXRjaCAodHlwZW9mIG1vbmdvT2JqZWN0KSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICBjYXNlICdudW1iZXInOlxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgICByZXR1cm4gbW9uZ29PYmplY3Q7XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgICB0aHJvdyAnYmFkIHZhbHVlIGluIG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCc7XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmIChtb25nb09iamVjdCA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC5tYXAobmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICByZXR1cm4gUGFyc2UuX2VuY29kZShtb25nb09iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuTG9uZykge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QudG9OdW1iZXIoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1vbmdvT2JqZWN0IGluc3RhbmNlb2YgbW9uZ29kYi5Eb3VibGUpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0LnZhbHVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoQnl0ZXNDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QobW9uZ29PYmplY3QpKSB7XG4gICAgICAgIHJldHVybiBCeXRlc0NvZGVyLmRhdGFiYXNlVG9KU09OKG1vbmdvT2JqZWN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwobW9uZ29PYmplY3QsICdfX3R5cGUnKSAmJlxuICAgICAgICBtb25nb09iamVjdC5fX3R5cGUgPT0gJ0RhdGUnICYmXG4gICAgICAgIG1vbmdvT2JqZWN0LmlzbyBpbnN0YW5jZW9mIERhdGVcbiAgICAgICkge1xuICAgICAgICBtb25nb09iamVjdC5pc28gPSBtb25nb09iamVjdC5pc28udG9KU09OKCk7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG1hcFZhbHVlcyhtb25nb09iamVjdCwgbmVzdGVkTW9uZ29PYmplY3RUb05lc3RlZFBhcnNlT2JqZWN0KTtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgJ3Vua25vd24ganMgdHlwZSc7XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcgPSAoc2NoZW1hLCBmaWVsZCwgcG9pbnRlclN0cmluZykgPT4ge1xuICBjb25zdCBvYmpEYXRhID0gcG9pbnRlclN0cmluZy5zcGxpdCgnJCcpO1xuICBpZiAob2JqRGF0YVswXSAhPT0gc2NoZW1hLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MpIHtcbiAgICB0aHJvdyAncG9pbnRlciB0byBpbmNvcnJlY3QgY2xhc3NOYW1lJztcbiAgfVxuICByZXR1cm4ge1xuICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgIGNsYXNzTmFtZTogb2JqRGF0YVswXSxcbiAgICBvYmplY3RJZDogb2JqRGF0YVsxXSxcbiAgfTtcbn07XG5cbi8vIENvbnZlcnRzIGZyb20gYSBtb25nby1mb3JtYXQgb2JqZWN0IHRvIGEgUkVTVC1mb3JtYXQgb2JqZWN0LlxuLy8gRG9lcyBub3Qgc3RyaXAgb3V0IGFueXRoaW5nIGJhc2VkIG9uIGEgbGFjayBvZiBhdXRoZW50aWNhdGlvbi5cbmNvbnN0IG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCA9IChjbGFzc05hbWUsIG1vbmdvT2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgc3dpdGNoICh0eXBlb2YgbW9uZ29PYmplY3QpIHtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgIHJldHVybiBtb25nb09iamVjdDtcbiAgICBjYXNlICdzeW1ib2wnOlxuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgIHRocm93ICdiYWQgdmFsdWUgaW4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0JztcbiAgICBjYXNlICdvYmplY3QnOiB7XG4gICAgICBpZiAobW9uZ29PYmplY3QgPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICByZXR1cm4gbW9uZ29PYmplY3QubWFwKG5lc3RlZE1vbmdvT2JqZWN0VG9OZXN0ZWRQYXJzZU9iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgcmV0dXJuIFBhcnNlLl9lbmNvZGUobW9uZ29PYmplY3QpO1xuICAgICAgfVxuXG4gICAgICBpZiAobW9uZ29PYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkxvbmcpIHtcbiAgICAgICAgcmV0dXJuIG1vbmdvT2JqZWN0LnRvTnVtYmVyKCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChtb25nb09iamVjdCBpbnN0YW5jZW9mIG1vbmdvZGIuRG91YmxlKSB7XG4gICAgICAgIHJldHVybiBtb25nb09iamVjdC52YWx1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKEJ5dGVzQ29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KG1vbmdvT2JqZWN0KSkge1xuICAgICAgICByZXR1cm4gQnl0ZXNDb2Rlci5kYXRhYmFzZVRvSlNPTihtb25nb09iamVjdCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3RPYmplY3QgPSB7fTtcbiAgICAgIGlmIChtb25nb09iamVjdC5fcnBlcm0gfHwgbW9uZ29PYmplY3QuX3dwZXJtKSB7XG4gICAgICAgIHJlc3RPYmplY3QuX3JwZXJtID0gbW9uZ29PYmplY3QuX3JwZXJtIHx8IFtdO1xuICAgICAgICByZXN0T2JqZWN0Ll93cGVybSA9IG1vbmdvT2JqZWN0Ll93cGVybSB8fCBbXTtcbiAgICAgICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll9ycGVybTtcbiAgICAgICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll93cGVybTtcbiAgICAgIH1cblxuICAgICAgZm9yICh2YXIga2V5IGluIG1vbmdvT2JqZWN0KSB7XG4gICAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgICAgY2FzZSAnX2lkJzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ29iamVjdElkJ10gPSAnJyArIG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdfaGFzaGVkX3Bhc3N3b3JkJzpcbiAgICAgICAgICAgIHJlc3RPYmplY3QuX2hhc2hlZF9wYXNzd29yZCA9IG1vbmdvT2JqZWN0W2tleV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdfYWNsJzpcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ19lbWFpbF92ZXJpZnlfdG9rZW4nOlxuICAgICAgICAgIGNhc2UgJ19wZXJpc2hhYmxlX3Rva2VuJzpcbiAgICAgICAgICBjYXNlICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgICAgICBjYXNlICdfcGFzc3dvcmRfY2hhbmdlZF9hdCc6XG4gICAgICAgICAgY2FzZSAnX3RvbWJzdG9uZSc6XG4gICAgICAgICAgY2FzZSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JzpcbiAgICAgICAgICBjYXNlICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnOlxuICAgICAgICAgIGNhc2UgJ19mYWlsZWRfbG9naW5fY291bnQnOlxuICAgICAgICAgIGNhc2UgJ19wYXNzd29yZF9oaXN0b3J5JzpcbiAgICAgICAgICAgIC8vIFRob3NlIGtleXMgd2lsbCBiZSBkZWxldGVkIGlmIG5lZWRlZCBpbiB0aGUgREIgQ29udHJvbGxlclxuICAgICAgICAgICAgcmVzdE9iamVjdFtrZXldID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ19zZXNzaW9uX3Rva2VuJzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ3Nlc3Npb25Ub2tlbiddID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ3VwZGF0ZWRBdCc6XG4gICAgICAgICAgY2FzZSAnX3VwZGF0ZWRfYXQnOlxuICAgICAgICAgICAgcmVzdE9iamVjdFsndXBkYXRlZEF0J10gPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKG1vbmdvT2JqZWN0W2tleV0pKS5pc287XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdjcmVhdGVkQXQnOlxuICAgICAgICAgIGNhc2UgJ19jcmVhdGVkX2F0JzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ2NyZWF0ZWRBdCddID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZShtb25nb09iamVjdFtrZXldKSkuaXNvO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnZXhwaXJlc0F0JzpcbiAgICAgICAgICBjYXNlICdfZXhwaXJlc0F0JzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ2V4cGlyZXNBdCddID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZShtb25nb09iamVjdFtrZXldKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdsYXN0VXNlZCc6XG4gICAgICAgICAgY2FzZSAnX2xhc3RfdXNlZCc6XG4gICAgICAgICAgICByZXN0T2JqZWN0WydsYXN0VXNlZCddID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZShtb25nb09iamVjdFtrZXldKSkuaXNvO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAndGltZXNVc2VkJzpcbiAgICAgICAgICBjYXNlICd0aW1lc191c2VkJzpcbiAgICAgICAgICAgIHJlc3RPYmplY3RbJ3RpbWVzVXNlZCddID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2F1dGhEYXRhJzpcbiAgICAgICAgICAgIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgICAgICAgbG9nLndhcm4oXG4gICAgICAgICAgICAgICAgJ2lnbm9yaW5nIGF1dGhEYXRhIGluIF9Vc2VyIGFzIHRoaXMga2V5IGlzIHJlc2VydmVkIHRvIGJlIHN5bnRoZXNpemVkIG9mIGBfYXV0aF9kYXRhXypgIGtleXMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXN0T2JqZWN0WydhdXRoRGF0YSddID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAvLyBDaGVjayBvdGhlciBhdXRoIGRhdGEga2V5c1xuICAgICAgICAgICAgdmFyIGF1dGhEYXRhTWF0Y2ggPSBrZXkubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICAgICAgICAgIGlmIChhdXRoRGF0YU1hdGNoICYmIGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICAgICAgICByZXN0T2JqZWN0WydhdXRoRGF0YSddID0gcmVzdE9iamVjdFsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgICAgICAgcmVzdE9iamVjdFsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSBtb25nb09iamVjdFtrZXldO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGtleS5pbmRleE9mKCdfcF8nKSA9PSAwKSB7XG4gICAgICAgICAgICAgIHZhciBuZXdLZXkgPSBrZXkuc3Vic3RyaW5nKDMpO1xuICAgICAgICAgICAgICBpZiAoIXNjaGVtYS5maWVsZHNbbmV3S2V5XSkge1xuICAgICAgICAgICAgICAgIGxvZy5pbmZvKFxuICAgICAgICAgICAgICAgICAgJ3RyYW5zZm9ybS5qcycsXG4gICAgICAgICAgICAgICAgICAnRm91bmQgYSBwb2ludGVyIGNvbHVtbiBub3QgaW4gdGhlIHNjaGVtYSwgZHJvcHBpbmcgaXQuJyxcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIG5ld0tleVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbbmV3S2V5XS50eXBlICE9PSAnUG9pbnRlcicpIHtcbiAgICAgICAgICAgICAgICBsb2cuaW5mbyhcbiAgICAgICAgICAgICAgICAgICd0cmFuc2Zvcm0uanMnLFxuICAgICAgICAgICAgICAgICAgJ0ZvdW5kIGEgcG9pbnRlciBpbiBhIG5vbi1wb2ludGVyIGNvbHVtbiwgZHJvcHBpbmcgaXQuJyxcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIGtleVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKG1vbmdvT2JqZWN0W2tleV0gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXN0T2JqZWN0W25ld0tleV0gPSB0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nKHNjaGVtYSwgbmV3S2V5LCBtb25nb09iamVjdFtrZXldKTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGtleVswXSA9PSAnXycgJiYga2V5ICE9ICdfX3R5cGUnKSB7XG4gICAgICAgICAgICAgIHRocm93ICdiYWQga2V5IGluIHVudHJhbnNmb3JtOiAnICsga2V5O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdmFyIHZhbHVlID0gbW9uZ29PYmplY3Rba2V5XTtcbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnRmlsZScgJiZcbiAgICAgICAgICAgICAgICBGaWxlQ29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHZhbHVlKVxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBGaWxlQ29kZXIuZGF0YWJhc2VUb0pTT04odmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0gJiZcbiAgICAgICAgICAgICAgICBzY2hlbWEuZmllbGRzW2tleV0udHlwZSA9PT0gJ0dlb1BvaW50JyAmJlxuICAgICAgICAgICAgICAgIEdlb1BvaW50Q29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHZhbHVlKVxuICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBHZW9Qb2ludENvZGVyLmRhdGFiYXNlVG9KU09OKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldICYmXG4gICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1trZXldLnR5cGUgPT09ICdQb2x5Z29uJyAmJlxuICAgICAgICAgICAgICAgIFBvbHlnb25Db2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QodmFsdWUpXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IFBvbHlnb25Db2Rlci5kYXRhYmFzZVRvSlNPTih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XSAmJlxuICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNba2V5XS50eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICAgICAgICAgICAgQnl0ZXNDb2Rlci5pc1ZhbGlkRGF0YWJhc2VPYmplY3QodmFsdWUpXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJlc3RPYmplY3Rba2V5XSA9IEJ5dGVzQ29kZXIuZGF0YWJhc2VUb0pTT04odmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN0T2JqZWN0W2tleV0gPSBuZXN0ZWRNb25nb09iamVjdFRvTmVzdGVkUGFyc2VPYmplY3QobW9uZ29PYmplY3Rba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVsYXRpb25GaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZmlsdGVyKFxuICAgICAgICBmaWVsZE5hbWUgPT4gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbidcbiAgICAgICk7XG4gICAgICBjb25zdCByZWxhdGlvbkZpZWxkcyA9IHt9O1xuICAgICAgcmVsYXRpb25GaWVsZE5hbWVzLmZvckVhY2gocmVsYXRpb25GaWVsZE5hbWUgPT4ge1xuICAgICAgICByZWxhdGlvbkZpZWxkc1tyZWxhdGlvbkZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tyZWxhdGlvbkZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHsgLi4ucmVzdE9iamVjdCwgLi4ucmVsYXRpb25GaWVsZHMgfTtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93ICd1bmtub3duIGpzIHR5cGUnO1xuICB9XG59O1xuXG52YXIgRGF0ZUNvZGVyID0ge1xuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIG5ldyBEYXRlKGpzb24uaXNvKTtcbiAgfSxcblxuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnO1xuICB9LFxufTtcblxudmFyIEJ5dGVzQ29kZXIgPSB7XG4gIGJhc2U2NFBhdHRlcm46IG5ldyBSZWdFeHAoJ14oPzpbQS1aYS16MC05Ky9dezR9KSooPzpbQS1aYS16MC05Ky9dezJ9PT18W0EtWmEtejAtOSsvXXszfT0pPyQnKSxcbiAgaXNCYXNlNjRWYWx1ZShvYmplY3QpIHtcbiAgICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYmFzZTY0UGF0dGVybi50ZXN0KG9iamVjdCk7XG4gIH0sXG5cbiAgZGF0YWJhc2VUb0pTT04ob2JqZWN0KSB7XG4gICAgbGV0IHZhbHVlO1xuICAgIGlmICh0aGlzLmlzQmFzZTY0VmFsdWUob2JqZWN0KSkge1xuICAgICAgdmFsdWUgPSBvYmplY3Q7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlID0gb2JqZWN0LmJ1ZmZlci50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdCeXRlcycsXG4gICAgICBiYXNlNjQ6IHZhbHVlLFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiBtb25nb2RiLkJpbmFyeSB8fCB0aGlzLmlzQmFzZTY0VmFsdWUob2JqZWN0KTtcbiAgfSxcblxuICBKU09OVG9EYXRhYmFzZShqc29uKSB7XG4gICAgcmV0dXJuIG5ldyBtb25nb2RiLkJpbmFyeShCdWZmZXIuZnJvbShqc29uLmJhc2U2NCwgJ2Jhc2U2NCcpKTtcbiAgfSxcblxuICBpc1ZhbGlkSlNPTih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0J5dGVzJztcbiAgfSxcbn07XG5cbnZhciBHZW9Qb2ludENvZGVyID0ge1xuICBkYXRhYmFzZVRvSlNPTihvYmplY3QpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgbGF0aXR1ZGU6IG9iamVjdFsxXSxcbiAgICAgIGxvbmdpdHVkZTogb2JqZWN0WzBdLFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiBBcnJheSAmJiBvYmplY3QubGVuZ3RoID09IDI7XG4gIH0sXG5cbiAgSlNPTlRvRGF0YWJhc2UoanNvbikge1xuICAgIHJldHVybiBbanNvbi5sb25naXR1ZGUsIGpzb24ubGF0aXR1ZGVdO1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnO1xuICB9LFxufTtcblxudmFyIFBvbHlnb25Db2RlciA9IHtcbiAgZGF0YWJhc2VUb0pTT04ob2JqZWN0KSB7XG4gICAgLy8gQ29udmVydCBsbmcvbGF0IC0+IGxhdC9sbmdcbiAgICBjb25zdCBjb29yZHMgPSBvYmplY3QuY29vcmRpbmF0ZXNbMF0ubWFwKGNvb3JkID0+IHtcbiAgICAgIHJldHVybiBbY29vcmRbMV0sIGNvb3JkWzBdXTtcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICBjb29yZGluYXRlczogY29vcmRzLFxuICAgIH07XG4gIH0sXG5cbiAgaXNWYWxpZERhdGFiYXNlT2JqZWN0KG9iamVjdCkge1xuICAgIGNvbnN0IGNvb3JkcyA9IG9iamVjdC5jb29yZGluYXRlc1swXTtcbiAgICBpZiAob2JqZWN0LnR5cGUgIT09ICdQb2x5Z29uJyB8fCAhKGNvb3JkcyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNvb3Jkcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgcG9pbnQgPSBjb29yZHNbaV07XG4gICAgICBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZERhdGFiYXNlT2JqZWN0KHBvaW50KSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocGFyc2VGbG9hdChwb2ludFsxXSksIHBhcnNlRmxvYXQocG9pbnRbMF0pKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH0sXG5cbiAgSlNPTlRvRGF0YWJhc2UoanNvbikge1xuICAgIGxldCBjb29yZHMgPSBqc29uLmNvb3JkaW5hdGVzO1xuICAgIC8vIEFkZCBmaXJzdCBwb2ludCB0byB0aGUgZW5kIHRvIGNsb3NlIHBvbHlnb25cbiAgICBpZiAoXG4gICAgICBjb29yZHNbMF1bMF0gIT09IGNvb3Jkc1tjb29yZHMubGVuZ3RoIC0gMV1bMF0gfHxcbiAgICAgIGNvb3Jkc1swXVsxXSAhPT0gY29vcmRzW2Nvb3Jkcy5sZW5ndGggLSAxXVsxXVxuICAgICkge1xuICAgICAgY29vcmRzLnB1c2goY29vcmRzWzBdKTtcbiAgICB9XG4gICAgY29uc3QgdW5pcXVlID0gY29vcmRzLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgICBsZXQgZm91bmRJbmRleCA9IC0xO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgICBpZiAocHRbMF0gPT09IGl0ZW1bMF0gJiYgcHRbMV0gPT09IGl0ZW1bMV0pIHtcbiAgICAgICAgICBmb3VuZEluZGV4ID0gaTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICAgIH0pO1xuICAgIGlmICh1bmlxdWUubGVuZ3RoIDwgMykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICdHZW9KU09OOiBMb29wIG11c3QgaGF2ZSBhdCBsZWFzdCAzIGRpZmZlcmVudCB2ZXJ0aWNlcydcbiAgICAgICk7XG4gICAgfVxuICAgIC8vIENvbnZlcnQgbGF0L2xvbmcgLT4gbG9uZy9sYXRcbiAgICBjb29yZHMgPSBjb29yZHMubWFwKGNvb3JkID0+IHtcbiAgICAgIHJldHVybiBbY29vcmRbMV0sIGNvb3JkWzBdXTtcbiAgICB9KTtcbiAgICByZXR1cm4geyB0eXBlOiAnUG9seWdvbicsIGNvb3JkaW5hdGVzOiBbY29vcmRzXSB9O1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnUG9seWdvbic7XG4gIH0sXG59O1xuXG52YXIgRmlsZUNvZGVyID0ge1xuICBkYXRhYmFzZVRvSlNPTihvYmplY3QpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnRmlsZScsXG4gICAgICBuYW1lOiBvYmplY3QsXG4gICAgfTtcbiAgfSxcblxuICBpc1ZhbGlkRGF0YWJhc2VPYmplY3Qob2JqZWN0KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBvYmplY3QgPT09ICdzdHJpbmcnO1xuICB9LFxuXG4gIEpTT05Ub0RhdGFiYXNlKGpzb24pIHtcbiAgICByZXR1cm4ganNvbi5uYW1lO1xuICB9LFxuXG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnRmlsZSc7XG4gIH0sXG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdHJhbnNmb3JtS2V5LFxuICBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUsXG4gIHRyYW5zZm9ybVVwZGF0ZSxcbiAgdHJhbnNmb3JtV2hlcmUsXG4gIG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCxcbiAgdHJhbnNmb3JtQ29uc3RyYWludCxcbiAgdHJhbnNmb3JtUG9pbnRlclN0cmluZyxcbn07XG4iXSwibWFwcGluZ3MiOiI7O0FBQUEsSUFBQUEsT0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQXVCLFNBQUFELHVCQUFBRyxHQUFBLFdBQUFBLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLEdBQUFELEdBQUEsS0FBQUUsT0FBQSxFQUFBRixHQUFBO0FBQUEsU0FBQUcsUUFBQUMsQ0FBQSxFQUFBQyxDQUFBLFFBQUFDLENBQUEsR0FBQUMsTUFBQSxDQUFBQyxJQUFBLENBQUFKLENBQUEsT0FBQUcsTUFBQSxDQUFBRSxxQkFBQSxRQUFBQyxDQUFBLEdBQUFILE1BQUEsQ0FBQUUscUJBQUEsQ0FBQUwsQ0FBQSxHQUFBQyxDQUFBLEtBQUFLLENBQUEsR0FBQUEsQ0FBQSxDQUFBQyxNQUFBLFdBQUFOLENB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