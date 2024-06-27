"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PostgresStorageAdapter = void 0;
var _PostgresClient = require("./PostgresClient");
var _node = _interopRequireDefault(require("parse/node"));
var _lodash = _interopRequireDefault(require("lodash"));
var _uuid = require("uuid");
var _sql = _interopRequireDefault(require("./sql"));
var _StorageAdapter = require("../StorageAdapter");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } // -disable-next
// -disable-next
// -disable-next
const Utils = require('../../../Utils');
const PostgresRelationDoesNotExistError = '42P01';
const PostgresDuplicateRelationError = '42P07';
const PostgresDuplicateColumnError = '42701';
const PostgresMissingColumnError = '42703';
const PostgresUniqueIndexViolationError = '23505';
const logger = require('../../../logger');
const debug = function (...args) {
  args = ['PG: ' + arguments[0]].concat(args.slice(1, args.length));
  const log = logger.getLogger();
  log.debug.apply(log, args);
};
const parseTypeToPostgresType = type => {
  switch (type.type) {
    case 'String':
      return 'text';
    case 'Date':
      return 'timestamp with time zone';
    case 'Object':
      return 'jsonb';
    case 'File':
      return 'text';
    case 'Boolean':
      return 'boolean';
    case 'Pointer':
      return 'text';
    case 'Number':
      return 'double precision';
    case 'GeoPoint':
      return 'point';
    case 'Bytes':
      return 'jsonb';
    case 'Polygon':
      return 'polygon';
    case 'Array':
      if (type.contents && type.contents.type === 'String') {
        return 'text[]';
      } else {
        return 'jsonb';
      }
    default:
      throw `no type for ${JSON.stringify(type)} yet`;
  }
};
const ParseToPosgresComparator = {
  $gt: '>',
  $lt: '<',
  $gte: '>=',
  $lte: '<='
};
const mongoAggregateToPostgres = {
  $dayOfMonth: 'DAY',
  $dayOfWeek: 'DOW',
  $dayOfYear: 'DOY',
  $isoDayOfWeek: 'ISODOW',
  $isoWeekYear: 'ISOYEAR',
  $hour: 'HOUR',
  $minute: 'MINUTE',
  $second: 'SECOND',
  $millisecond: 'MILLISECONDS',
  $month: 'MONTH',
  $week: 'WEEK',
  $year: 'YEAR'
};
const toPostgresValue = value => {
  if (typeof value === 'object') {
    if (value.__type === 'Date') {
      return value.iso;
    }
    if (value.__type === 'File') {
      return value.name;
    }
  }
  return value;
};
const toPostgresValueCastType = value => {
  const postgresValue = toPostgresValue(value);
  let castType;
  switch (typeof postgresValue) {
    case 'number':
      castType = 'double precision';
      break;
    case 'boolean':
      castType = 'boolean';
      break;
    default:
      castType = undefined;
  }
  return castType;
};
const transformValue = value => {
  if (typeof value === 'object' && value.__type === 'Pointer') {
    return value.objectId;
  }
  return value;
};

// Duplicate from then mongo adapter...
const emptyCLPS = Object.freeze({
  find: {},
  get: {},
  count: {},
  create: {},
  update: {},
  delete: {},
  addField: {},
  protectedFields: {}
});
const defaultCLPS = Object.freeze({
  find: {
    '*': true
  },
  get: {
    '*': true
  },
  count: {
    '*': true
  },
  create: {
    '*': true
  },
  update: {
    '*': true
  },
  delete: {
    '*': true
  },
  addField: {
    '*': true
  },
  protectedFields: {
    '*': []
  }
});
const toParseSchema = schema => {
  if (schema.className === '_User') {
    delete schema.fields._hashed_password;
  }
  if (schema.fields) {
    delete schema.fields._wperm;
    delete schema.fields._rperm;
  }
  let clps = defaultCLPS;
  if (schema.classLevelPermissions) {
    clps = _objectSpread(_objectSpread({}, emptyCLPS), schema.classLevelPermissions);
  }
  let indexes = {};
  if (schema.indexes) {
    indexes = _objectSpread({}, schema.indexes);
  }
  return {
    className: schema.className,
    fields: schema.fields,
    classLevelPermissions: clps,
    indexes
  };
};
const toPostgresSchema = schema => {
  if (!schema) {
    return schema;
  }
  schema.fields = schema.fields || {};
  schema.fields._wperm = {
    type: 'Array',
    contents: {
      type: 'String'
    }
  };
  schema.fields._rperm = {
    type: 'Array',
    contents: {
      type: 'String'
    }
  };
  if (schema.className === '_User') {
    schema.fields._hashed_password = {
      type: 'String'
    };
    schema.fields._password_history = {
      type: 'Array'
    };
  }
  return schema;
};
const handleDotFields = object => {
  Object.keys(object).forEach(fieldName => {
    if (fieldName.indexOf('.') > -1) {
      const components = fieldName.split('.');
      const first = components.shift();
      object[first] = object[first] || {};
      let currentObj = object[first];
      let next;
      let value = object[fieldName];
      if (value && value.__op === 'Delete') {
        value = undefined;
      }
      /* eslint-disable no-cond-assign */
      while (next = components.shift()) {
        /* eslint-enable no-cond-assign */
        currentObj[next] = currentObj[next] || {};
        if (components.length === 0) {
          currentObj[next] = value;
        }
        currentObj = currentObj[next];
      }
      delete object[fieldName];
    }
  });
  return object;
};
const transformDotFieldToComponents = fieldName => {
  return fieldName.split('.').map((cmpt, index) => {
    if (index === 0) {
      return `"${cmpt}"`;
    }
    return `'${cmpt}'`;
  });
};
const transformDotField = fieldName => {
  if (fieldName.indexOf('.') === -1) {
    return `"${fieldName}"`;
  }
  const components = transformDotFieldToComponents(fieldName);
  let name = components.slice(0, components.length - 1).join('->');
  name += '->>' + components[components.length - 1];
  return name;
};
const transformAggregateField = fieldName => {
  if (typeof fieldName !== 'string') {
    return fieldName;
  }
  if (fieldName === '$_created_at') {
    return 'createdAt';
  }
  if (fieldName === '$_updated_at') {
    return 'updatedAt';
  }
  return fieldName.substring(1);
};
const validateKeys = object => {
  if (typeof object == 'object') {
    for (const key in object) {
      if (typeof object[key] == 'object') {
        validateKeys(object[key]);
      }
      if (key.includes('$') || key.includes('.')) {
        throw new _node.default.Error(_node.default.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
      }
    }
  }
};

// Returns the list of join tables on a schema
const joinTablesForSchema = schema => {
  const list = [];
  if (schema) {
    Object.keys(schema.fields).forEach(field => {
      if (schema.fields[field].type === 'Relation') {
        list.push(`_Join:${field}:${schema.className}`);
      }
    });
  }
  return list;
};
const buildWhereClause = ({
  schema,
  query,
  index,
  caseInsensitive
}) => {
  const patterns = [];
  let values = [];
  const sorts = [];
  schema = toPostgresSchema(schema);
  for (const fieldName in query) {
    const isArrayField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
    const initialPatternsLength = patterns.length;
    const fieldValue = query[fieldName];

    // nothing in the schema, it's gonna blow up
    if (!schema.fields[fieldName]) {
      // as it won't exist
      if (fieldValue && fieldValue.$exists === false) {
        continue;
      }
    }
    const authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
    if (authDataMatch) {
      // TODO: Handle querying by _auth_data_provider, authData is stored in authData field
      continue;
    } else if (caseInsensitive && (fieldName === 'username' || fieldName === 'email')) {
      patterns.push(`LOWER($${index}:name) = LOWER($${index + 1})`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (fieldName.indexOf('.') >= 0) {
      let name = transformDotField(fieldName);
      if (fieldValue === null) {
        patterns.push(`$${index}:raw IS NULL`);
        values.push(name);
        index += 1;
        continue;
      } else {
        if (fieldValue.$in) {
          name = transformDotFieldToComponents(fieldName).join('->');
          patterns.push(`($${index}:raw)::jsonb @> $${index + 1}::jsonb`);
          values.push(name, JSON.stringify(fieldValue.$in));
          index += 2;
        } else if (fieldValue.$regex) {
          // Handle later
        } else if (typeof fieldValue !== 'object') {
          patterns.push(`$${index}:raw = $${index + 1}::text`);
          values.push(name, fieldValue);
          index += 2;
        }
      }
    } else if (fieldValue === null || fieldValue === undefined) {
      patterns.push(`$${index}:name IS NULL`);
      values.push(fieldName);
      index += 1;
      continue;
    } else if (typeof fieldValue === 'string') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (typeof fieldValue === 'boolean') {
      patterns.push(`$${index}:name = $${index + 1}`);
      // Can't cast boolean to double precision
      if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Number') {
        // Should always return zero results
        const MAX_INT_PLUS_ONE = 9223372036854775808;
        values.push(fieldName, MAX_INT_PLUS_ONE);
      } else {
        values.push(fieldName, fieldValue);
      }
      index += 2;
    } else if (typeof fieldValue === 'number') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (['$or', '$nor', '$and'].includes(fieldName)) {
      const clauses = [];
      const clauseValues = [];
      fieldValue.forEach(subQuery => {
        const clause = buildWhereClause({
          schema,
          query: subQuery,
          index,
          caseInsensitive
        });
        if (clause.pattern.length > 0) {
          clauses.push(clause.pattern);
          clauseValues.push(...clause.values);
          index += clause.values.length;
        }
      });
      const orOrAnd = fieldName === '$and' ? ' AND ' : ' OR ';
      const not = fieldName === '$nor' ? ' NOT ' : '';
      patterns.push(`${not}(${clauses.join(orOrAnd)})`);
      values.push(...clauseValues);
    }
    if (fieldValue.$ne !== undefined) {
      if (isArrayField) {
        fieldValue.$ne = JSON.stringify([fieldValue.$ne]);
        patterns.push(`NOT array_contains($${index}:name, $${index + 1})`);
      } else {
        if (fieldValue.$ne === null) {
          patterns.push(`$${index}:name IS NOT NULL`);
          values.push(fieldName);
          index += 1;
          continue;
        } else {
          // if not null, we need to manually exclude null
          if (fieldValue.$ne.__type === 'GeoPoint') {
            patterns.push(`($${index}:name <> POINT($${index + 1}, $${index + 2}) OR $${index}:name IS NULL)`);
          } else {
            if (fieldName.indexOf('.') >= 0) {
              const castType = toPostgresValueCastType(fieldValue.$ne);
              const constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
              patterns.push(`(${constraintFieldName} <> $${index + 1} OR ${constraintFieldName} IS NULL)`);
            } else if (typeof fieldValue.$ne === 'object' && fieldValue.$ne.$relativeTime) {
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
            } else {
              patterns.push(`($${index}:name <> $${index + 1} OR $${index}:name IS NULL)`);
            }
          }
        }
      }
      if (fieldValue.$ne.__type === 'GeoPoint') {
        const point = fieldValue.$ne;
        values.push(fieldName, point.longitude, point.latitude);
        index += 3;
      } else {
        // TODO: support arrays
        values.push(fieldName, fieldValue.$ne);
        index += 2;
      }
    }
    if (fieldValue.$eq !== undefined) {
      if (fieldValue.$eq === null) {
        patterns.push(`$${index}:name IS NULL`);
        values.push(fieldName);
        index += 1;
      } else {
        if (fieldName.indexOf('.') >= 0) {
          const castType = toPostgresValueCastType(fieldValue.$eq);
          const constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
          values.push(fieldValue.$eq);
          patterns.push(`${constraintFieldName} = $${index++}`);
        } else if (typeof fieldValue.$eq === 'object' && fieldValue.$eq.$relativeTime) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
        } else {
          values.push(fieldName, fieldValue.$eq);
          patterns.push(`$${index}:name = $${index + 1}`);
          index += 2;
        }
      }
    }
    const isInOrNin = Array.isArray(fieldValue.$in) || Array.isArray(fieldValue.$nin);
    if (Array.isArray(fieldValue.$in) && isArrayField && schema.fields[fieldName].contents && schema.fields[fieldName].contents.type === 'String') {
      const inPatterns = [];
      let allowNull = false;
      values.push(fieldName);
      fieldValue.$in.forEach((listElem, listIndex) => {
        if (listElem === null) {
          allowNull = true;
        } else {
          values.push(listElem);
          inPatterns.push(`$${index + 1 + listIndex - (allowNull ? 1 : 0)}`);
        }
      });
      if (allowNull) {
        patterns.push(`($${index}:name IS NULL OR $${index}:name && ARRAY[${inPatterns.join()}])`);
      } else {
        patterns.push(`$${index}:name && ARRAY[${inPatterns.join()}]`);
      }
      index = index + 1 + inPatterns.length;
    } else if (isInOrNin) {
      var createConstraint = (baseArray, notIn) => {
        const not = notIn ? ' NOT ' : '';
        if (baseArray.length > 0) {
          if (isArrayField) {
            patterns.push(`${not} array_contains($${index}:name, $${index + 1})`);
            values.push(fieldName, JSON.stringify(baseArray));
            index += 2;
          } else {
            // Handle Nested Dot Notation Above
            if (fieldName.indexOf('.') >= 0) {
              return;
            }
            const inPatterns = [];
            values.push(fieldName);
            baseArray.forEach((listElem, listIndex) => {
              if (listElem != null) {
                values.push(listElem);
                inPatterns.push(`$${index + 1 + listIndex}`);
              }
            });
            patterns.push(`$${index}:name ${not} IN (${inPatterns.join()})`);
            index = index + 1 + inPatterns.length;
          }
        } else if (!notIn) {
          values.push(fieldName);
          patterns.push(`$${index}:name IS NULL`);
          index = index + 1;
        } else {
          // Handle empty array
          if (notIn) {
            patterns.push('1 = 1'); // Return all values
          } else {
            patterns.push('1 = 2'); // Return no values
          }
        }
      };
      if (fieldValue.$in) {
        createConstraint(_lodash.default.flatMap(fieldValue.$in, elt => elt), false);
      }
      if (fieldValue.$nin) {
        createConstraint(_lodash.default.flatMap(fieldValue.$nin, elt => elt), true);
      }
    } else if (typeof fieldValue.$in !== 'undefined') {
      throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $in value');
    } else if (typeof fieldValue.$nin !== 'undefined') {
      throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $nin value');
    }
    if (Array.isArray(fieldValue.$all) && isArrayField) {
      if (isAnyValueRegexStartsWith(fieldValue.$all)) {
        if (!isAllValuesRegexOrNone(fieldValue.$all)) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'All $all values must be of regex type or none: ' + fieldValue.$all);
        }
        for (let i = 0; i < fieldValue.$all.length; i += 1) {
          const value = processRegexPattern(fieldValue.$all[i].$regex);
          fieldValue.$all[i] = value.substring(1) + '%';
        }
        patterns.push(`array_contains_all_regex($${index}:name, $${index + 1}::jsonb)`);
      } else {
        patterns.push(`array_contains_all($${index}:name, $${index + 1}::jsonb)`);
      }
      values.push(fieldName, JSON.stringify(fieldValue.$all));
      index += 2;
    } else if (Array.isArray(fieldValue.$all)) {
      if (fieldValue.$all.length === 1) {
        patterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.$all[0].objectId);
        index += 2;
      }
    }
    if (typeof fieldValue.$exists !== 'undefined') {
      if (typeof fieldValue.$exists === 'object' && fieldValue.$exists.$relativeTime) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
      } else if (fieldValue.$exists) {
        patterns.push(`$${index}:name IS NOT NULL`);
      } else {
        patterns.push(`$${index}:name IS NULL`);
      }
      values.push(fieldName);
      index += 1;
    }
    if (fieldValue.$containedBy) {
      const arr = fieldValue.$containedBy;
      if (!(arr instanceof Array)) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $containedBy: should be an array`);
      }
      patterns.push(`$${index}:name <@ $${index + 1}::jsonb`);
      values.push(fieldName, JSON.stringify(arr));
      index += 2;
    }
    if (fieldValue.$text) {
      const search = fieldValue.$text.$search;
      let language = 'english';
      if (typeof search !== 'object') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $search, should be object`);
      }
      if (!search.$term || typeof search.$term !== 'string') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $term, should be string`);
      }
      if (search.$language && typeof search.$language !== 'string') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $language, should be string`);
      } else if (search.$language) {
        language = search.$language;
      }
      if (search.$caseSensitive && typeof search.$caseSensitive !== 'boolean') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $caseSensitive, should be boolean`);
      } else if (search.$caseSensitive) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $caseSensitive not supported, please use $regex or create a separate lower case column.`);
      }
      if (search.$diacriticSensitive && typeof search.$diacriticSensitive !== 'boolean') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $diacriticSensitive, should be boolean`);
      } else if (search.$diacriticSensitive === false) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $diacriticSensitive - false not supported, install Postgres Unaccent Extension`);
      }
      patterns.push(`to_tsvector($${index}, $${index + 1}:name) @@ to_tsquery($${index + 2}, $${index + 3})`);
      values.push(language, fieldName, language, search.$term);
      index += 4;
    }
    if (fieldValue.$nearSphere) {
      const point = fieldValue.$nearSphere;
      const distance = fieldValue.$maxDistance;
      const distanceInKM = distance * 6371 * 1000;
      patterns.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
      sorts.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) ASC`);
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }
    if (fieldValue.$within && fieldValue.$within.$box) {
      const box = fieldValue.$within.$box;
      const left = box[0].longitude;
      const bottom = box[0].latitude;
      const right = box[1].longitude;
      const top = box[1].latitude;
      patterns.push(`$${index}:name::point <@ $${index + 1}::box`);
      values.push(fieldName, `((${left}, ${bottom}), (${right}, ${top}))`);
      index += 2;
    }
    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$centerSphere) {
      const centerSphere = fieldValue.$geoWithin.$centerSphere;
      if (!(centerSphere instanceof Array) || centerSphere.length < 2) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere should be an array of Parse.GeoPoint and distance');
      }
      // Get point, convert to geo point if necessary and validate
      let point = centerSphere[0];
      if (point instanceof Array && point.length === 2) {
        point = new _node.default.GeoPoint(point[1], point[0]);
      } else if (!GeoPointCoder.isValidJSON(point)) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere geo point invalid');
      }
      _node.default.GeoPoint._validate(point.latitude, point.longitude);
      // Get distance and validate
      const distance = centerSphere[1];
      if (isNaN(distance) || distance < 0) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere distance invalid');
      }
      const distanceInKM = distance * 6371 * 1000;
      patterns.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }
    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$polygon) {
      const polygon = fieldValue.$geoWithin.$polygon;
      let points;
      if (typeof polygon === 'object' && polygon.__type === 'Polygon') {
        if (!polygon.coordinates || polygon.coordinates.length < 3) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; Polygon.coordinates should contain at least 3 lon/lat pairs');
        }
        points = polygon.coordinates;
      } else if (polygon instanceof Array) {
        if (polygon.length < 3) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $polygon should contain at least 3 GeoPoints');
        }
        points = polygon;
      } else {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, "bad $geoWithin value; $polygon should be Polygon object or Array of Parse.GeoPoint's");
      }
      points = points.map(point => {
        if (point instanceof Array && point.length === 2) {
          _node.default.GeoPoint._validate(point[1], point[0]);
          return `(${point[0]}, ${point[1]})`;
        }
        if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value');
        } else {
          _node.default.GeoPoint._validate(point.latitude, point.longitude);
        }
        return `(${point.longitude}, ${point.latitude})`;
      }).join(', ');
      patterns.push(`$${index}:name::point <@ $${index + 1}::polygon`);
      values.push(fieldName, `(${points})`);
      index += 2;
    }
    if (fieldValue.$geoIntersects && fieldValue.$geoIntersects.$point) {
      const point = fieldValue.$geoIntersects.$point;
      if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoIntersect value; $point should be GeoPoint');
      } else {
        _node.default.GeoPoint._validate(point.latitude, point.longitude);
      }
      patterns.push(`$${index}:name::polygon @> $${index + 1}::point`);
      values.push(fieldName, `(${point.longitude}, ${point.latitude})`);
      index += 2;
    }
    if (fieldValue.$regex) {
      let regex = fieldValue.$regex;
      let operator = '~';
      const opts = fieldValue.$options;
      if (opts) {
        if (opts.indexOf('i') >= 0) {
          operator = '~*';
        }
        if (opts.indexOf('x') >= 0) {
          regex = removeWhiteSpace(regex);
        }
      }
      const name = transformDotField(fieldName);
      regex = processRegexPattern(regex);
      patterns.push(`$${index}:raw ${operator} '$${index + 1}:raw'`);
      values.push(name, regex);
      index += 2;
    }
    if (fieldValue.__type === 'Pointer') {
      if (isArrayField) {
        patterns.push(`array_contains($${index}:name, $${index + 1})`);
        values.push(fieldName, JSON.stringify([fieldValue]));
        index += 2;
      } else {
        patterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      }
    }
    if (fieldValue.__type === 'Date') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue.iso);
      index += 2;
    }
    if (fieldValue.__type === 'GeoPoint') {
      patterns.push(`$${index}:name ~= POINT($${index + 1}, $${index + 2})`);
      values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
      index += 3;
    }
    if (fieldValue.__type === 'Polygon') {
      const value = convertPolygonToSQL(fieldValue.coordinates);
      patterns.push(`$${index}:name ~= $${index + 1}::polygon`);
      values.push(fieldName, value);
      index += 2;
    }
    Object.keys(ParseToPosgresComparator).forEach(cmp => {
      if (fieldValue[cmp] || fieldValue[cmp] === 0) {
        const pgComparator = ParseToPosgresComparator[cmp];
        let constraintFieldName;
        let postgresValue = toPostgresValue(fieldValue[cmp]);
        if (fieldName.indexOf('.') >= 0) {
          const castType = toPostgresValueCastType(fieldValue[cmp]);
          constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
        } else {
          if (typeof postgresValue === 'object' && postgresValue.$relativeTime) {
            if (schema.fields[fieldName].type !== 'Date') {
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with Date field');
            }
            const parserResult = Utils.relativeTimeToDate(postgresValue.$relativeTime);
            if (parserResult.status === 'success') {
              postgresValue = toPostgresValue(parserResult.result);
            } else {
              console.error('Error while parsing relative date', parserResult);
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $relativeTime (${postgresValue.$relativeTime}) value. ${parserResult.info}`);
            }
          }
          constraintFieldName = `$${index++}:name`;
          values.push(fieldName);
        }
        values.push(postgresValue);
        patterns.push(`${constraintFieldName} ${pgComparator} $${index++}`);
      }
    });
    if (initialPatternsLength === patterns.length) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, `Postgres doesn't support this query type yet ${JSON.stringify(fieldValue)}`);
    }
  }
  values = values.map(transformValue);
  return {
    pattern: patterns.join(' AND '),
    values,
    sorts
  };
};
class PostgresStorageAdapter {
  // Private

  constructor({
    uri,
    collectionPrefix = '',
    databaseOptions = {}
  }) {
    const options = _objectSpread({}, databaseOptions);
    this._collectionPrefix = collectionPrefix;
    this.enableSchemaHooks = !!databaseOptions.enableSchemaHooks;
    this.schemaCacheTtl = databaseOptions.schemaCacheTtl;
    for (const key of ['enableSchemaHooks', 'schemaCacheTtl']) {
      delete options[key];
    }
    const {
      client,
      pgp
    } = (0, _PostgresClient.createClient)(uri, options);
    this._client = client;
    this._onchange = () => {};
    this._pgp = pgp;
    this._uuid = (0, _uuid.v4)();
    this.canSortOnJoinTables = false;
  }
  watch(callback) {
    this._onchange = callback;
  }

  //Note that analyze=true will run the query, executing INSERTS, DELETES, etc.
  createExplainableQuery(query, analyze = false) {
    if (analyze) {
      return 'EXPLAIN (ANALYZE, FORMAT JSON) ' + query;
    } else {
      return 'EXPLAIN (FORMAT JSON) ' + query;
    }
  }
  handleShutdown() {
    if (this._stream) {
      this._stream.done();
      delete this._stream;
    }
    if (!this._client) {
      return;
    }
    this._client.$pool.end();
  }
  async _listenToSchema() {
    if (!this._stream && this.enableSchemaHooks) {
      this._stream = await this._client.connect({
        direct: true
      });
      this._stream.client.on('notification', data => {
        const payload = JSON.parse(data.payload);
        if (payload.senderId !== this._uuid) {
          this._onchange();
        }
      });
      await this._stream.none('LISTEN $1~', 'schema.change');
    }
  }
  _notifySchemaChange() {
    if (this._stream) {
      this._stream.none('NOTIFY $1~, $2', ['schema.change', {
        senderId: this._uuid
      }]).catch(error => {
        console.log('Failed to Notify:', error); // unlikely to ever happen
      });
    }
  }
  async _ensureSchemaCollectionExists(conn) {
    conn = conn || this._client;
    await conn.none('CREATE TABLE IF NOT EXISTS "_SCHEMA" ( "className" varChar(120), "schema" jsonb, "isParseClass" bool, PRIMARY KEY ("className") )').catch(error => {
      throw error;
    });
  }
  async classExists(name) {
    return this._client.one('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)', [name], a => a.exists);
  }
  async setClassLevelPermissions(className, CLPs) {
    await this._client.task('set-class-level-permissions', async t => {
      const values = [className, 'schema', 'classLevelPermissions', JSON.stringify(CLPs)];
      await t.none(`UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className" = $1`, values);
    });
    this._notifySchemaChange();
  }
  async setIndexesWithSchemaFormat(className, submittedIndexes, existingIndexes = {}, fields, conn) {
    conn = conn || this._client;
    const self = this;
    if (submittedIndexes === undefined) {
      return Promise.resolve();
    }
    if (Object.keys(existingIndexes).length === 0) {
      existingIndexes = {
        _id_: {
          _id: 1
        }
      };
    }
    const deletedIndexes = [];
    const insertedIndexes = [];
    Object.keys(submittedIndexes).forEach(name => {
      const field = submittedIndexes[name];
      if (existingIndexes[name] && field.__op !== 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} exists, cannot update.`);
      }
      if (!existingIndexes[name] && field.__op === 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} does not exist, cannot delete.`);
      }
      if (field.__op === 'Delete') {
        deletedIndexes.push(name);
        delete existingIndexes[name];
      } else {
        Object.keys(field).forEach(key => {
          if (!Object.prototype.hasOwnProperty.call(fields, key)) {
            throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Field ${key} does not exist, cannot add index.`);
          }
        });
        existingIndexes[name] = field;
        insertedIndexes.push({
          key: field,
          name
        });
      }
    });
    await conn.tx('set-indexes-with-schema-format', async t => {
      if (insertedIndexes.length > 0) {
        await self.createIndexes(className, insertedIndexes, t);
      }
      if (deletedIndexes.length > 0) {
        await self.dropIndexes(className, deletedIndexes, t);
      }
      await t.none('UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className" = $1', [className, 'schema', 'indexes', JSON.stringify(existingIndexes)]);
    });
    this._notifySchemaChange();
  }
  async createClass(className, schema, conn) {
    conn = conn || this._client;
    const parseSchema = await conn.tx('create-class', async t => {
      await this.createTable(className, schema, t);
      await t.none('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($<className>, $<schema>, true)', {
        className,
        schema
      });
      await this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields, t);
      return toParseSchema(schema);
    }).catch(err => {
      if (err.code === PostgresUniqueIndexViolationError && err.detail.includes(className)) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, `Class ${className} already exists.`);
      }
      throw err;
    });
    this._notifySchemaChange();
    return parseSchema;
  }

  // Just create a table, do not insert in schema
  async createTable(className, schema, conn) {
    conn = conn || this._client;
    debug('createTable');
    const valuesArray = [];
    const patternsArray = [];
    const fields = Object.assign({}, schema.fields);
    if (className === '_User') {
      fields._email_verify_token_expires_at = {
        type: 'Date'
      };
      fields._email_verify_token = {
        type: 'String'
      };
      fields._account_lockout_expires_at = {
        type: 'Date'
      };
      fields._failed_login_count = {
        type: 'Number'
      };
      fields._perishable_token = {
        type: 'String'
      };
      fields._perishable_token_expires_at = {
        type: 'Date'
      };
      fields._password_changed_at = {
        type: 'Date'
      };
      fields._password_history = {
        type: 'Array'
      };
    }
    let index = 2;
    const relations = [];
    Object.keys(fields).forEach(fieldName => {
      const parseType = fields[fieldName];
      // Skip when it's a relation
      // We'll create the tables later
      if (parseType.type === 'Relation') {
        relations.push(fieldName);
        return;
      }
      if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
        parseType.contents = {
          type: 'String'
        };
      }
      valuesArray.push(fieldName);
      valuesArray.push(parseTypeToPostgresType(parseType));
      patternsArray.push(`$${index}:name $${index + 1}:raw`);
      if (fieldName === 'objectId') {
        patternsArray.push(`PRIMARY KEY ($${index}:name)`);
      }
      index = index + 2;
    });
    const qs = `CREATE TABLE IF NOT EXISTS $1:name (${patternsArray.join()})`;
    const values = [className, ...valuesArray];
    return conn.task('create-table', async t => {
      try {
        await t.none(qs, values);
      } catch (error) {
        if (error.code !== PostgresDuplicateRelationError) {
          throw error;
        }
        // ELSE: Table already exists, must have been created by a different request. Ignore the error.
      }
      await t.tx('create-table-tx', tx => {
        return tx.batch(relations.map(fieldName => {
          return tx.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {
            joinTable: `_Join:${fieldName}:${className}`
          });
        }));
      });
    });
  }
  async schemaUpgrade(className, schema, conn) {
    debug('schemaUpgrade');
    conn = conn || this._client;
    const self = this;
    await conn.task('schema-upgrade', async t => {
      const columns = await t.map('SELECT column_name FROM information_schema.columns WHERE table_name = $<className>', {
        className
      }, a => a.column_name);
      const newColumns = Object.keys(schema.fields).filter(item => columns.indexOf(item) === -1).map(fieldName => self.addFieldIfNotExists(className, fieldName, schema.fields[fieldName]));
      await t.batch(newColumns);
    });
  }
  async addFieldIfNotExists(className, fieldName, type) {
    // TODO: Must be revised for invalid logic...
    debug('addFieldIfNotExists');
    const self = this;
    await this._client.tx('add-field-if-not-exists', async t => {
      if (type.type !== 'Relation') {
        try {
          await t.none('ALTER TABLE $<className:name> ADD COLUMN IF NOT EXISTS $<fieldName:name> $<postgresType:raw>', {
            className,
            fieldName,
            postgresType: parseTypeToPostgresType(type)
          });
        } catch (error) {
          if (error.code === PostgresRelationDoesNotExistError) {
            return self.createClass(className, {
              fields: {
                [fieldName]: type
              }
            }, t);
          }
          if (error.code !== PostgresDuplicateColumnError) {
            throw error;
          }
          // Column already exists, created by other request. Carry on to see if it's the right type.
        }
      } else {
        await t.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {
          joinTable: `_Join:${fieldName}:${className}`
        });
      }
      const result = await t.any('SELECT "schema" FROM "_SCHEMA" WHERE "className" = $<className> and ("schema"::json->\'fields\'->$<fieldName>) is not null', {
        className,
        fieldName
      });
      if (result[0]) {
        throw 'Attempted to add a field that already exists';
      } else {
        const path = `{fields,${fieldName}}`;
        await t.none('UPDATE "_SCHEMA" SET "schema"=jsonb_set("schema", $<path>, $<type>)  WHERE "className"=$<className>', {
          path,
          type,
          className
        });
      }
    });
    this._notifySchemaChange();
  }
  async updateFieldOptions(className, fieldName, type) {
    await this._client.tx('update-schema-field-options', async t => {
      const path = `{fields,${fieldName}}`;
      await t.none('UPDATE "_SCHEMA" SET "schema"=jsonb_set("schema", $<path>, $<type>)  WHERE "className"=$<className>', {
        path,
        type,
        className
      });
    });
  }

  // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.
  async deleteClass(className) {
    const operations = [{
      query: `DROP TABLE IF EXISTS $1:name`,
      values: [className]
    }, {
      query: `DELETE FROM "_SCHEMA" WHERE "className" = $1`,
      values: [className]
    }];
    const response = await this._client.tx(t => t.none(this._pgp.helpers.concat(operations))).then(() => className.indexOf('_Join:') != 0); // resolves with false when _Join table

    this._notifySchemaChange();
    return response;
  }

  // Delete all data known to this adapter. Used for testing.
  async deleteAllClasses() {
    var _this$_client;
    const now = new Date().getTime();
    const helpers = this._pgp.helpers;
    debug('deleteAllClasses');
    if ((_this$_client = this._client) !== null && _this$_client !== void 0 && _this$_client.$pool.ended) {
      return;
    }
    await this._client.task('delete-all-classes', async t => {
      try {
        const results = await t.any('SELECT * FROM "_SCHEMA"');
        const joins = results.reduce((list, schema) => {
          return list.concat(joinTablesForSchema(schema.schema));
        }, []);
        const classes = ['_SCHEMA', '_PushStatus', '_JobStatus', '_JobSchedule', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_Audience', '_Idempotency', ...results.map(result => result.className), ...joins];
        const queries = classes.map(className => ({
          query: 'DROP TABLE IF EXISTS $<className:name>',
          values: {
            className
          }
        }));
        await t.tx(tx => tx.none(helpers.concat(queries)));
      } catch (error) {
        if (error.code !== PostgresRelationDoesNotExistError) {
          throw error;
        }
        // No _SCHEMA collection. Don't delete anything.
      }
    }).then(() => {
      debug(`deleteAllClasses done in ${new Date().getTime() - now}`);
    });
  }

  // Remove the column and all the data. For Relations, the _Join collection is handled
  // specially, this function does not delete _Join columns. It should, however, indicate
  // that the relation fields does not exist anymore. In mongo, this means removing it from
  // the _SCHEMA collection.  There should be no actual data in the collection under the same name
  // as the relation column, so it's fine to attempt to delete it. If the fields listed to be
  // deleted do not exist, this function should return successfully anyways. Checking for
  // attempts to delete non-existent fields is the responsibility of Parse Server.

  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.

  // Returns a Promise.
  async deleteFields(className, schema, fieldNames) {
    debug('deleteFields');
    fieldNames = fieldNames.reduce((list, fieldName) => {
      const field = schema.fields[fieldName];
      if (field.type !== 'Relation') {
        list.push(fieldName);
      }
      delete schema.fields[fieldName];
      return list;
    }, []);
    const values = [className, ...fieldNames];
    const columns = fieldNames.map((name, idx) => {
      return `$${idx + 2}:name`;
    }).join(', DROP COLUMN');
    await this._client.tx('delete-fields', async t => {
      await t.none('UPDATE "_SCHEMA" SET "schema" = $<schema> WHERE "className" = $<className>', {
        schema,
        className
      });
      if (values.length > 1) {
        await t.none(`ALTER TABLE $1:name DROP COLUMN IF EXISTS ${columns}`, values);
      }
    });
    this._notifySchemaChange();
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  async getAllClasses() {
    return this._client.task('get-all-classes', async t => {
      return await t.map('SELECT * FROM "_SCHEMA"', null, row => toParseSchema(_objectSpread({
        className: row.className
      }, row.schema)));
    });
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  async getClass(className) {
    debug('getClass');
    return this._client.any('SELECT * FROM "_SCHEMA" WHERE "className" = $<className>', {
      className
    }).then(result => {
      if (result.length !== 1) {
        throw undefined;
      }
      return result[0].schema;
    }).then(toParseSchema);
  }

  // TODO: remove the mongo format dependency in the return value
  async createObject(className, schema, object, transactionalSession) {
    debug('createObject');
    let columnsArray = [];
    const valuesArray = [];
    schema = toPostgresSchema(schema);
    const geoPoints = {};
    object = handleDotFields(object);
    validateKeys(object);
    Object.keys(object).forEach(fieldName => {
      if (object[fieldName] === null) {
        return;
      }
      var authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      const authDataAlreadyExists = !!object.authData;
      if (authDataMatch) {
        var provider = authDataMatch[1];
        object['authData'] = object['authData'] || {};
        object['authData'][provider] = object[fieldName];
        delete object[fieldName];
        fieldName = 'authData';
        // Avoid adding authData multiple times to the query
        if (authDataAlreadyExists) {
          return;
        }
      }
      columnsArray.push(fieldName);
      if (!schema.fields[fieldName] && className === '_User') {
        if (fieldName === '_email_verify_token' || fieldName === '_failed_login_count' || fieldName === '_perishable_token' || fieldName === '_password_history') {
          valuesArray.push(object[fieldName]);
        }
        if (fieldName === '_email_verify_token_expires_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }
        if (fieldName === '_account_lockout_expires_at' || fieldName === '_perishable_token_expires_at' || fieldName === '_password_changed_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }
        return;
      }
      switch (schema.fields[fieldName].type) {
        case 'Date':
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
          break;
        case 'Pointer':
          valuesArray.push(object[fieldName].objectId);
          break;
        case 'Array':
          if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
            valuesArray.push(object[fieldName]);
          } else {
            valuesArray.push(JSON.stringify(object[fieldName]));
          }
          break;
        case 'Object':
        case 'Bytes':
        case 'String':
        case 'Number':
        case 'Boolean':
          valuesArray.push(object[fieldName]);
          break;
        case 'File':
          valuesArray.push(object[fieldName].name);
          break;
        case 'Polygon':
          {
            const value = convertPolygonToSQL(object[fieldName].coordinates);
            valuesArray.push(value);
            break;
          }
        case 'GeoPoint':
          // pop the point and process later
          geoPoints[fieldName] = object[fieldName];
          columnsArray.pop();
          break;
        default:
          throw `Type ${schema.fields[fieldName].type} not supported yet`;
      }
    });
    columnsArray = columnsArray.concat(Object.keys(geoPoints));
    const initialValues = valuesArray.map((val, index) => {
      let termination = '';
      const fieldName = columnsArray[index];
      if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
        termination = '::text[]';
      } else if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        termination = '::jsonb';
      }
      return `$${index + 2 + columnsArray.length}${termination}`;
    });
    const geoPointsInjects = Object.keys(geoPoints).map(key => {
      const value = geoPoints[key];
      valuesArray.push(value.longitude, value.latitude);
      const l = valuesArray.length + columnsArray.length;
      return `POINT($${l}, $${l + 1})`;
    });
    const columnsPattern = columnsArray.map((col, index) => `$${index + 2}:name`).join();
    const valuesPattern = initialValues.concat(geoPointsInjects).join();
    const qs = `INSERT INTO $1:name (${columnsPattern}) VALUES (${valuesPattern})`;
    const values = [className, ...columnsArray, ...valuesArray];
    const promise = (transactionalSession ? transactionalSession.t : this._client).none(qs, values).then(() => ({
      ops: [object]
    })).catch(error => {
      if (error.code === PostgresUniqueIndexViolationError) {
        const err = new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        err.underlyingError = error;
        if (error.constraint) {
          const matches = error.constraint.match(/unique_([a-zA-Z]+)/);
          if (matches && Array.isArray(matches)) {
            err.userInfo = {
              duplicated_field: matches[1]
            };
          }
        }
        error = err;
      }
      throw error;
    });
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }

  // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.
  async deleteObjectsByQuery(className, schema, query, transactionalSession) {
    debug('deleteObjectsByQuery');
    const values = [className];
    const index = 2;
    const where = buildWhereClause({
      schema,
      index,
      query,
      caseInsensitive: false
    });
    values.push(...where.values);
    if (Object.keys(query).length === 0) {
      where.pattern = 'TRUE';
    }
    const qs = `WITH deleted AS (DELETE FROM $1:name WHERE ${where.pattern} RETURNING *) SELECT count(*) FROM deleted`;
    const promise = (transactionalSession ? transactionalSession.t : this._client).one(qs, values, a => +a.count).then(count => {
      if (count === 0) {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Object not found.');
      } else {
        return count;
      }
    }).catch(error => {
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      // ELSE: Don't delete anything if doesn't exist
    });
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }
  // Return value not currently well specified.
  async findOneAndUpdate(className, schema, query, update, transactionalSession) {
    debug('findOneAndUpdate');
    return this.updateObjectsByQuery(className, schema, query, update, transactionalSession).then(val => val[0]);
  }

  // Apply the update to all objects that match the given Parse Query.
  async updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    debug('updateObjectsByQuery');
    const updatePatterns = [];
    const values = [className];
    let index = 2;
    schema = toPostgresSchema(schema);
    const originalUpdate = _objectSpread({}, update);

    // Set flag for dot notation fields
    const dotNotationOptions = {};
    Object.keys(update).forEach(fieldName => {
      if (fieldName.indexOf('.') > -1) {
        const components = fieldName.split('.');
        const first = components.shift();
        dotNotationOptions[first] = true;
      } else {
        dotNotationOptions[fieldName] = false;
      }
    });
    update = handleDotFields(update);
    // Resolve authData first,
    // So we don't end up with multiple key updates
    for (const fieldName in update) {
      const authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      if (authDataMatch) {
        var provider = authDataMatch[1];
        const value = update[fieldName];
        delete update[fieldName];
        update['authData'] = update['authData'] || {};
        update['authData'][provider] = value;
      }
    }
    for (const fieldName in update) {
      const fieldValue = update[fieldName];
      // Drop any undefined values.
      if (typeof fieldValue === 'undefined') {
        delete update[fieldName];
      } else if (fieldValue === null) {
        updatePatterns.push(`$${index}:name = NULL`);
        values.push(fieldName);
        index += 1;
      } else if (fieldName == 'authData') {
        // This recursively sets the json_object
        // Only 1 level deep
        const generate = (jsonb, key, value) => {
          return `json_object_set_key(COALESCE(${jsonb}, '{}'::jsonb), ${key}, ${value})::jsonb`;
        };
        const lastKey = `$${index}:name`;
        const fieldNameIndex = index;
        index += 1;
        values.push(fieldName);
        const update = Object.keys(fieldValue).reduce((lastKey, key) => {
          const str = generate(lastKey, `$${index}::text`, `$${index + 1}::jsonb`);
          index += 2;
          let value = fieldValue[key];
          if (value) {
            if (value.__op === 'Delete') {
              value = null;
            } else {
              value = JSON.stringify(value);
            }
          }
          values.push(key, value);
          return str;
        }, lastKey);
        updatePatterns.push(`$${fieldNameIndex}:name = ${update}`);
      } else if (fieldValue.__op === 'Increment') {
        updatePatterns.push(`$${index}:name = COALESCE($${index}:name, 0) + $${index + 1}`);
        values.push(fieldName, fieldValue.amount);
        index += 2;
      } else if (fieldValue.__op === 'Add') {
        updatePatterns.push(`$${index}:name = array_add(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'Delete') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, null);
        index += 2;
      } else if (fieldValue.__op === 'Remove') {
        updatePatterns.push(`$${index}:name = array_remove(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'AddUnique') {
        updatePatterns.push(`$${index}:name = array_add_unique(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldName === 'updatedAt') {
        //TODO: stop special casing this. It should check for __type === 'Date' and use .iso
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'string') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'boolean') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (fieldValue.__type === 'Pointer') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      } else if (fieldValue.__type === 'Date') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue));
        index += 2;
      } else if (fieldValue instanceof Date) {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (fieldValue.__type === 'File') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue));
        index += 2;
      } else if (fieldValue.__type === 'GeoPoint') {
        updatePatterns.push(`$${index}:name = POINT($${index + 1}, $${index + 2})`);
        values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
        index += 3;
      } else if (fieldValue.__type === 'Polygon') {
        const value = convertPolygonToSQL(fieldValue.coordinates);
        updatePatterns.push(`$${index}:name = $${index + 1}::polygon`);
        values.push(fieldName, value);
        index += 2;
      } else if (fieldValue.__type === 'Relation') {
        // noop
      } else if (typeof fieldValue === 'number') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'object' && schema.fields[fieldName] && schema.fields[fieldName].type === 'Object') {
        // Gather keys to increment
        const keysToIncrement = Object.keys(originalUpdate).filter(k => {
          // choose top level fields that have a delete operation set
          // Note that Object.keys is iterating over the **original** update object
          // and that some of the keys of the original update could be null or undefined:
          // (See the above check `if (fieldValue === null || typeof fieldValue == "undefined")`)
          const value = originalUpdate[k];
          return value && value.__op === 'Increment' && k.split('.').length === 2 && k.split('.')[0] === fieldName;
        }).map(k => k.split('.')[1]);
        let incrementPatterns = '';
        if (keysToIncrement.length > 0) {
          incrementPatterns = ' || ' + keysToIncrement.map(c => {
            const amount = fieldValue[c].amount;
            return `CONCAT('{"${c}":', COALESCE($${index}:name->>'${c}','0')::int + ${amount}, '}')::jsonb`;
          }).join(' || ');
          // Strip the keys
          keysToIncrement.forEach(key => {
            delete fieldValue[key];
          });
        }
        const keysToDelete = Object.keys(originalUpdate).filter(k => {
          // choose top level fields that have a delete operation set.
          const value = originalUpdate[k];
          return value && value.__op === 'Delete' && k.split('.').length === 2 && k.split('.')[0] === fieldName;
        }).map(k => k.split('.')[1]);
        const deletePatterns = keysToDelete.reduce((p, c, i) => {
          return p + ` - '$${index + 1 + i}:value'`;
        }, '');
        // Override Object
        let updateObject = "'{}'::jsonb";
        if (dotNotationOptions[fieldName]) {
          // Merge Object
          updateObject = `COALESCE($${index}:name, '{}'::jsonb)`;
        }
        updatePatterns.push(`$${index}:name = (${updateObject} ${deletePatterns} ${incrementPatterns} || $${index + 1 + keysToDelete.length}::jsonb )`);
        values.push(fieldName, ...keysToDelete, JSON.stringify(fieldValue));
        index += 2 + keysToDelete.length;
      } else if (Array.isArray(fieldValue) && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        const expectedType = parseTypeToPostgresType(schema.fields[fieldName]);
        if (expectedType === 'text[]') {
          updatePatterns.push(`$${index}:name = $${index + 1}::text[]`);
          values.push(fieldName, fieldValue);
          index += 2;
        } else {
          updatePatterns.push(`$${index}:name = $${index + 1}::jsonb`);
          values.push(fieldName, JSON.stringify(fieldValue));
          index += 2;
        }
      } else {
        debug('Not supported update', {
          fieldName,
          fieldValue
        });
        return Promise.reject(new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, `Postgres doesn't support update ${JSON.stringify(fieldValue)} yet`));
      }
    }
    const where = buildWhereClause({
      schema,
      index,
      query,
      caseInsensitive: false
    });
    values.push(...where.values);
    const whereClause = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const qs = `UPDATE $1:name SET ${updatePatterns.join()} ${whereClause} RETURNING *`;
    const promise = (transactionalSession ? transactionalSession.t : this._client).any(qs, values);
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }

  // Hopefully, we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update, transactionalSession) {
    debug('upsertOneObject');
    const createValue = Object.assign({}, query, update);
    return this.createObject(className, schema, createValue, transactionalSession).catch(error => {
      // ignore duplicate value errors as it's upsert
      if (error.code !== _node.default.Error.DUPLICATE_VALUE) {
        throw error;
      }
      return this.findOneAndUpdate(className, schema, query, update, transactionalSession);
    });
  }
  find(className, schema, query, {
    skip,
    limit,
    sort,
    keys,
    caseInsensitive,
    explain
  }) {
    debug('find');
    const hasLimit = limit !== undefined;
    const hasSkip = skip !== undefined;
    let values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2,
      caseInsensitive
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const limitPattern = hasLimit ? `LIMIT $${values.length + 1}` : '';
    if (hasLimit) {
      values.push(limit);
    }
    const skipPattern = hasSkip ? `OFFSET $${values.length + 1}` : '';
    if (hasSkip) {
      values.push(skip);
    }
    let sortPattern = '';
    if (sort) {
      const sortCopy = sort;
      const sorting = Object.keys(sort).map(key => {
        const transformKey = transformDotFieldToComponents(key).join('->');
        // Using $idx pattern gives:  non-integer constant in ORDER BY
        if (sortCopy[key] === 1) {
          return `${transformKey} ASC`;
        }
        return `${transformKey} DESC`;
      }).join();
      sortPattern = sort !== undefined && Object.keys(sort).length > 0 ? `ORDER BY ${sorting}` : '';
    }
    if (where.sorts && Object.keys(where.sorts).length > 0) {
      sortPattern = `ORDER BY ${where.sorts.join()}`;
    }
    let columns = '*';
    if (keys) {
      // Exclude empty keys
      // Replace ACL by it's keys
      keys = keys.reduce((memo, key) => {
        if (key === 'ACL') {
          memo.push('_rperm');
          memo.push('_wperm');
        } else if (key.length > 0 && (
        // Remove selected field not referenced in the schema
        // Relation is not a column in postgres
        // $score is a Parse special field and is also not a column
        schema.fields[key] && schema.fields[key].type !== 'Relation' || key === '$score')) {
          memo.push(key);
        }
        return memo;
      }, []);
      columns = keys.map((key, index) => {
        if (key === '$score') {
          return `ts_rank_cd(to_tsvector($${2}, $${3}:name), to_tsquery($${4}, $${5}), 32) as score`;
        }
        return `$${index + values.length + 1}:name`;
      }).join();
      values = values.concat(keys);
    }
    const originalQuery = `SELECT ${columns} FROM $1:name ${wherePattern} ${sortPattern} ${limitPattern} ${skipPattern}`;
    const qs = explain ? this.createExplainableQuery(originalQuery) : originalQuery;
    return this._client.any(qs, values).catch(error => {
      // Query on non existing table, don't crash
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      return [];
    }).then(results => {
      if (explain) {
        return results;
      }
      return results.map(object => this.postgresObjectToParseObject(className, object, schema));
    });
  }

  // Converts from a postgres-format object to a REST-format object.
  // Does not strip out anything based on a lack of authentication.
  postgresObjectToParseObject(className, object, schema) {
    Object.keys(schema.fields).forEach(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer' && object[fieldName]) {
        object[fieldName] = {
          objectId: object[fieldName],
          __type: 'Pointer',
          className: schema.fields[fieldName].targetClass
        };
      }
      if (schema.fields[fieldName].type === 'Relation') {
        object[fieldName] = {
          __type: 'Relation',
          className: schema.fields[fieldName].targetClass
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'GeoPoint') {
        object[fieldName] = {
          __type: 'GeoPoint',
          latitude: object[fieldName].y,
          longitude: object[fieldName].x
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'Polygon') {
        let coords = new String(object[fieldName]);
        coords = coords.substring(2, coords.length - 2).split('),(');
        const updatedCoords = coords.map(point => {
          return [parseFloat(point.split(',')[1]), parseFloat(point.split(',')[0])];
        });
        object[fieldName] = {
          __type: 'Polygon',
          coordinates: updatedCoords
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'File') {
        object[fieldName] = {
          __type: 'File',
          name: object[fieldName]
        };
      }
    });
    //TODO: remove this reliance on the mongo format. DB adapter shouldn't know there is a difference between created at and any other date field.
    if (object.createdAt) {
      object.createdAt = object.createdAt.toISOString();
    }
    if (object.updatedAt) {
      object.updatedAt = object.updatedAt.toISOString();
    }
    if (object.expiresAt) {
      object.expiresAt = {
        __type: 'Date',
        iso: object.expiresAt.toISOString()
      };
    }
    if (object._email_verify_token_expires_at) {
      object._email_verify_token_expires_at = {
        __type: 'Date',
        iso: object._email_verify_token_expires_at.toISOString()
      };
    }
    if (object._account_lockout_expires_at) {
      object._account_lockout_expires_at = {
        __type: 'Date',
        iso: object._account_lockout_expires_at.toISOString()
      };
    }
    if (object._perishable_token_expires_at) {
      object._perishable_token_expires_at = {
        __type: 'Date',
        iso: object._perishable_token_expires_at.toISOString()
      };
    }
    if (object._password_changed_at) {
      object._password_changed_at = {
        __type: 'Date',
        iso: object._password_changed_at.toISOString()
      };
    }
    for (const fieldName in object) {
      if (object[fieldName] === null) {
        delete object[fieldName];
      }
      if (object[fieldName] instanceof Date) {
        object[fieldName] = {
          __type: 'Date',
          iso: object[fieldName].toISOString()
        };
      }
    }
    return object;
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  async ensureUniqueness(className, schema, fieldNames) {
    const constraintName = `${className}_unique_${fieldNames.sort().join('_')}`;
    const constraintPatterns = fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `CREATE UNIQUE INDEX IF NOT EXISTS $2:name ON $1:name(${constraintPatterns.join()})`;
    return this._client.none(qs, [className, constraintName, ...fieldNames]).catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(constraintName)) {
        // Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(constraintName)) {
        // Cast the error into the proper parse error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    });
  }

  // Executes a count.
  async count(className, schema, query, readPreference, estimate = true) {
    debug('count');
    const values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2,
      caseInsensitive: false
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    let qs = '';
    if (where.pattern.length > 0 || !estimate) {
      qs = `SELECT count(*) FROM $1:name ${wherePattern}`;
    } else {
      qs = 'SELECT reltuples AS approximate_row_count FROM pg_class WHERE relname = $1';
    }
    return this._client.one(qs, values, a => {
      if (a.approximate_row_count == null || a.approximate_row_count == -1) {
        return !isNaN(+a.count) ? +a.count : 0;
      } else {
        return +a.approximate_row_count;
      }
    }).catch(error => {
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      return 0;
    });
  }
  async distinct(className, schema, query, fieldName) {
    debug('distinct');
    let field = fieldName;
    let column = fieldName;
    const isNested = fieldName.indexOf('.') >= 0;
    if (isNested) {
      field = transformDotFieldToComponents(fieldName).join('->');
      column = fieldName.split('.')[0];
    }
    const isArrayField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
    const isPointerField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Pointer';
    const values = [field, column, className];
    const where = buildWhereClause({
      schema,
      query,
      index: 4,
      caseInsensitive: false
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const transformer = isArrayField ? 'jsonb_array_elements' : 'ON';
    let qs = `SELECT DISTINCT ${transformer}($1:name) $2:name FROM $3:name ${wherePattern}`;
    if (isNested) {
      qs = `SELECT DISTINCT ${transformer}($1:raw) $2:raw FROM $3:name ${wherePattern}`;
    }
    return this._client.any(qs, values).catch(error => {
      if (error.code === PostgresMissingColumnError) {
        return [];
      }
      throw error;
    }).then(results => {
      if (!isNested) {
        results = results.filter(object => object[field] !== null);
        return results.map(object => {
          if (!isPointerField) {
            return object[field];
          }
          return {
            __type: 'Pointer',
            className: schema.fields[fieldName].targetClass,
            objectId: object[field]
          };
        });
      }
      const child = fieldName.split('.')[1];
      return results.map(object => object[column][child]);
    }).then(results => results.map(object => this.postgresObjectToParseObject(className, object, schema)));
  }
  async aggregate(className, schema, pipeline, readPreference, hint, explain) {
    debug('aggregate');
    const values = [className];
    let index = 2;
    let columns = [];
    let countField = null;
    let groupValues = null;
    let wherePattern = '';
    let limitPattern = '';
    let skipPattern = '';
    let sortPattern = '';
    let groupPattern = '';
    for (let i = 0; i < pipeline.length; i += 1) {
      const stage = pipeline[i];
      if (stage.$group) {
        for (const field in stage.$group) {
          const value = stage.$group[field];
          if (value === null || value === undefined) {
            continue;
          }
          if (field === '_id' && typeof value === 'string' && value !== '') {
            columns.push(`$${index}:name AS "objectId"`);
            groupPattern = `GROUP BY $${index}:name`;
            values.push(transformAggregateField(value));
            index += 1;
            continue;
          }
          if (field === '_id' && typeof value === 'object' && Object.keys(value).length !== 0) {
            groupValues = value;
            const groupByFields = [];
            for (const alias in value) {
              if (typeof value[alias] === 'string' && value[alias]) {
                const source = transformAggregateField(value[alias]);
                if (!groupByFields.includes(`"${source}"`)) {
                  groupByFields.push(`"${source}"`);
                }
                values.push(source, alias);
                columns.push(`$${index}:name AS $${index + 1}:name`);
                index += 2;
              } else {
                const operation = Object.keys(value[alias])[0];
                const source = transformAggregateField(value[alias][operation]);
                if (mongoAggregateToPostgres[operation]) {
                  if (!groupByFields.includes(`"${source}"`)) {
                    groupByFields.push(`"${source}"`);
                  }
                  columns.push(`EXTRACT(${mongoAggregateToPostgres[operation]} FROM $${index}:name AT TIME ZONE 'UTC')::integer AS $${index + 1}:name`);
                  values.push(source, alias);
                  index += 2;
                }
              }
            }
            groupPattern = `GROUP BY $${index}:raw`;
            values.push(groupByFields.join());
            index += 1;
            continue;
          }
          if (typeof value === 'object') {
            if (value.$sum) {
              if (typeof value.$sum === 'string') {
                columns.push(`SUM($${index}:name) AS $${index + 1}:name`);
                values.push(transformAggregateField(value.$sum), field);
                index += 2;
              } else {
                countField = field;
                columns.push(`COUNT(*) AS $${index}:name`);
                values.push(field);
                index += 1;
              }
            }
            if (value.$max) {
              columns.push(`MAX($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$max), field);
              index += 2;
            }
            if (value.$min) {
              columns.push(`MIN($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$min), field);
              index += 2;
            }
            if (value.$avg) {
              columns.push(`AVG($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$avg), field);
              index += 2;
            }
          }
        }
      } else {
        columns.push('*');
      }
      if (stage.$project) {
        if (columns.includes('*')) {
          columns = [];
        }
        for (const field in stage.$project) {
          const value = stage.$project[field];
          if (value === 1 || value === true) {
            columns.push(`$${index}:name`);
            values.push(field);
            index += 1;
          }
        }
      }
      if (stage.$match) {
        const patterns = [];
        const orOrAnd = Object.prototype.hasOwnProperty.call(stage.$match, '$or') ? ' OR ' : ' AND ';
        if (stage.$match.$or) {
          const collapse = {};
          stage.$match.$or.forEach(element => {
            for (const key in element) {
              collapse[key] = element[key];
            }
          });
          stage.$match = collapse;
        }
        for (let field in stage.$match) {
          const value = stage.$match[field];
          if (field === '_id') {
            field = 'objectId';
          }
          const matchPatterns = [];
          Object.keys(ParseToPosgresComparator).forEach(cmp => {
            if (value[cmp]) {
              const pgComparator = ParseToPosgresComparator[cmp];
              matchPatterns.push(`$${index}:name ${pgComparator} $${index + 1}`);
              values.push(field, toPostgresValue(value[cmp]));
              index += 2;
            }
          });
          if (matchPatterns.length > 0) {
            patterns.push(`(${matchPatterns.join(' AND ')})`);
          }
          if (schema.fields[field] && schema.fields[field].type && matchPatterns.length === 0) {
            patterns.push(`$${index}:name = $${index + 1}`);
            values.push(field, value);
            index += 2;
          }
        }
        wherePattern = patterns.length > 0 ? `WHERE ${patterns.join(` ${orOrAnd} `)}` : '';
      }
      if (stage.$limit) {
        limitPattern = `LIMIT $${index}`;
        values.push(stage.$limit);
        index += 1;
      }
      if (stage.$skip) {
        skipPattern = `OFFSET $${index}`;
        values.push(stage.$skip);
        index += 1;
      }
      if (stage.$sort) {
        const sort = stage.$sort;
        const keys = Object.keys(sort);
        const sorting = keys.map(key => {
          const transformer = sort[key] === 1 ? 'ASC' : 'DESC';
          const order = `$${index}:name ${transformer}`;
          index += 1;
          return order;
        }).join();
        values.push(...keys);
        sortPattern = sort !== undefined && sorting.length > 0 ? `ORDER BY ${sorting}` : '';
      }
    }
    if (groupPattern) {
      columns.forEach((e, i, a) => {
        if (e && e.trim() === '*') {
          a[i] = '';
        }
      });
    }
    const originalQuery = `SELECT ${columns.filter(Boolean).join()} FROM $1:name ${wherePattern} ${skipPattern} ${groupPattern} ${sortPattern} ${limitPattern}`;
    const qs = explain ? this.createExplainableQuery(originalQuery) : originalQuery;
    return this._client.any(qs, values).then(a => {
      if (explain) {
        return a;
      }
      const results = a.map(object => this.postgresObjectToParseObject(className, object, schema));
      results.forEach(result => {
        if (!Object.prototype.hasOwnProperty.call(result, 'objectId')) {
          result.objectId = null;
        }
        if (groupValues) {
          result.objectId = {};
          for (const key in groupValues) {
            result.objectId[key] = result[key];
            delete result[key];
          }
        }
        if (countField) {
          result[countField] = parseInt(result[countField], 10);
        }
      });
      return results;
    });
  }
  async performInitialization({
    VolatileClassesSchemas
  }) {
    // TODO: This method needs to be rewritten to make proper use of connections (@vitaly-t)
    debug('performInitialization');
    await this._ensureSchemaCollectionExists();
    const promises = VolatileClassesSchemas.map(schema => {
      return this.createTable(schema.className, schema).catch(err => {
        if (err.code === PostgresDuplicateRelationError || err.code === _node.default.Error.INVALID_CLASS_NAME) {
          return Promise.resolve();
        }
        throw err;
      }).then(() => this.schemaUpgrade(schema.className, schema));
    });
    promises.push(this._listenToSchema());
    return Promise.all(promises).then(() => {
      return this._client.tx('perform-initialization', async t => {
        await t.none(_sql.default.misc.jsonObjectSetKeys);
        await t.none(_sql.default.array.add);
        await t.none(_sql.default.array.addUnique);
        await t.none(_sql.default.array.remove);
        await t.none(_sql.default.array.containsAll);
        await t.none(_sql.default.array.containsAllRegex);
        await t.none(_sql.default.array.contains);
        return t.ctx;
      });
    }).then(ctx => {
      debug(`initializationDone in ${ctx.duration}`);
    }).catch(error => {
      /* eslint-disable no-console */
      console.error(error);
    });
  }
  async createIndexes(className, indexes, conn) {
    return (conn || this._client).tx(t => t.batch(indexes.map(i => {
      return t.none('CREATE INDEX IF NOT EXISTS $1:name ON $2:name ($3:name)', [i.name, className, i.key]);
    })));
  }
  async createIndexesIfNeeded(className, fieldName, type, conn) {
    await (conn || this._client).none('CREATE INDEX IF NOT EXISTS $1:name ON $2:name ($3:name)', [fieldName, className, type]);
  }
  async dropIndexes(className, indexes, conn) {
    const queries = indexes.map(i => ({
      query: 'DROP INDEX $1:name',
      values: i
    }));
    await (conn || this._client).tx(t => t.none(this._pgp.helpers.concat(queries)));
  }
  async getIndexes(className) {
    const qs = 'SELECT * FROM pg_indexes WHERE tablename = ${className}';
    return this._client.any(qs, {
      className
    });
  }
  async updateSchemaWithIndexes() {
    return Promise.resolve();
  }

  // Used for testing purposes
  async updateEstimatedCount(className) {
    return this._client.none('ANALYZE $1:name', [className]);
  }
  async createTransactionalSession() {
    return new Promise(resolve => {
      const transactionalSession = {};
      transactionalSession.result = this._client.tx(t => {
        transactionalSession.t = t;
        transactionalSession.promise = new Promise(resolve => {
          transactionalSession.resolve = resolve;
        });
        transactionalSession.batch = [];
        resolve(transactionalSession);
        return transactionalSession.promise;
      });
    });
  }
  commitTransactionalSession(transactionalSession) {
    transactionalSession.resolve(transactionalSession.t.batch(transactionalSession.batch));
    return transactionalSession.result;
  }
  abortTransactionalSession(transactionalSession) {
    const result = transactionalSession.result.catch();
    transactionalSession.batch.push(Promise.reject());
    transactionalSession.resolve(transactionalSession.t.batch(transactionalSession.batch));
    return result;
  }
  async ensureIndex(className, schema, fieldNames, indexName, caseInsensitive = false, options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const defaultIndexName = `parse_default_${fieldNames.sort().join('_')}`;
    const indexNameOptions = indexName != null ? {
      name: indexName
    } : {
      name: defaultIndexName
    };
    const constraintPatterns = caseInsensitive ? fieldNames.map((fieldName, index) => `lower($${index + 3}:name) varchar_pattern_ops`) : fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `CREATE INDEX IF NOT EXISTS $1:name ON $2:name (${constraintPatterns.join()})`;
    const setIdempotencyFunction = options.setIdempotencyFunction !== undefined ? options.setIdempotencyFunction : false;
    if (setIdempotencyFunction) {
      await this.ensureIdempotencyFunctionExists(options);
    }
    await conn.none(qs, [indexNameOptions.name, className, ...fieldNames]).catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(indexNameOptions.name)) {
        // Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(indexNameOptions.name)) {
        // Cast the error into the proper parse error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    });
  }
  async deleteIdempotencyFunction(options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const qs = 'DROP FUNCTION IF EXISTS idempotency_delete_expired_records()';
    return conn.none(qs).catch(error => {
      throw error;
    });
  }
  async ensureIdempotencyFunctionExists(options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const ttlOptions = options.ttl !== undefined ? `${options.ttl} seconds` : '60 seconds';
    const qs = 'CREATE OR REPLACE FUNCTION idempotency_delete_expired_records() RETURNS void LANGUAGE plpgsql AS $$ BEGIN DELETE FROM "_Idempotency" WHERE expire < NOW() - INTERVAL $1; END; $$;';
    return conn.none(qs, [ttlOptions]).catch(error => {
      throw error;
    });
  }
}
exports.PostgresStorageAdapter = PostgresStorageAdapter;
function convertPolygonToSQL(polygon) {
  if (polygon.length < 3) {
    throw new _node.default.Error(_node.default.Error.INVALID_JSON, `Polygon must have at least 3 values`);
  }
  if (polygon[0][0] !== polygon[polygon.length - 1][0] || polygon[0][1] !== polygon[polygon.length - 1][1]) {
    polygon.push(polygon[0]);
  }
  const unique = polygon.filter((item, index, ar) => {
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
    throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'GeoJSON: Loop must have at least 3 different vertices');
  }
  const points = polygon.map(point => {
    _node.default.GeoPoint._validate(parseFloat(point[1]), parseFloat(point[0]));
    return `(${point[1]}, ${point[0]})`;
  }).join(', ');
  return `(${points})`;
}
function removeWhiteSpace(regex) {
  if (!regex.endsWith('\n')) {
    regex += '\n';
  }

  // remove non escaped comments
  return regex.replace(/([^\\])#.*\n/gim, '$1')
  // remove lines starting with a comment
  .replace(/^#.*\n/gim, '')
  // remove non escaped whitespace
  .replace(/([^\\])\s+/gim, '$1')
  // remove whitespace at the beginning of a line
  .replace(/^\s+/, '').trim();
}
function processRegexPattern(s) {
  if (s && s.startsWith('^')) {
    // regex for startsWith
    return '^' + literalizeRegexPart(s.slice(1));
  } else if (s && s.endsWith('$')) {
    // regex for endsWith
    return literalizeRegexPart(s.slice(0, s.length - 1)) + '$';
  }

  // regex for contains
  return literalizeRegexPart(s);
}
function isStartsWithRegex(value) {
  if (!value || typeof value !== 'string' || !value.startsWith('^')) {
    return false;
  }
  const matches = value.match(/\^\\Q.*\\E/);
  return !!matches;
}
function isAllValuesRegexOrNone(values) {
  if (!values || !Array.isArray(values) || values.length === 0) {
    return true;
  }
  const firstValuesIsRegex = isStartsWithRegex(values[0].$regex);
  if (values.length === 1) {
    return firstValuesIsRegex;
  }
  for (let i = 1, length = values.length; i < length; ++i) {
    if (firstValuesIsRegex !== isStartsWithRegex(values[i].$regex)) {
      return false;
    }
  }
  return true;
}
function isAnyValueRegexStartsWith(values) {
  return values.some(function (value) {
    return isStartsWithRegex(value.$regex);
  });
}
function createLiteralRegex(remaining) {
  return remaining.split('').map(c => {
    const regex = RegExp('[0-9 ]|\\p{L}', 'u'); // Support all unicode letter chars
    if (c.match(regex) !== null) {
      // don't escape alphanumeric characters
      return c;
    }
    // escape everything else (single quotes with single quotes, everything else with a backslash)
    return c === `'` ? `''` : `\\${c}`;
  }).join('');
}
function literalizeRegexPart(s) {
  const matcher1 = /\\Q((?!\\E).*)\\E$/;
  const result1 = s.match(matcher1);
  if (result1 && result1.length > 1 && result1.index > -1) {
    // process regex that has a beginning and an end specified for the literal text
    const prefix = s.substring(0, result1.index);
    const remaining = result1[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // process regex that has a beginning specified for the literal text
  const matcher2 = /\\Q((?!\\E).*)$/;
  const result2 = s.match(matcher2);
  if (result2 && result2.length > 1 && result2.index > -1) {
    const prefix = s.substring(0, result2.index);
    const remaining = result2[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // remove all instances of \Q and \E from the remaining text & escape single quotes
  return s.replace(/([^\\])(\\E)/, '$1').replace(/([^\\])(\\Q)/, '$1').replace(/^\\E/, '').replace(/^\\Q/, '').replace(/([^'])'/g, `$1''`).replace(/^'([^'])/, `''$1`);
}
var GeoPointCoder = {
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'GeoPoint';
  }
};
var _default = exports.default = PostgresStorageAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUG9zdGdyZXNDbGllbnQiLCJyZXF1aXJlIiwiX25vZGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2xvZGFzaCIsIl91dWlkIiwiX3NxbCIsIl9TdG9yYWdlQWRhcHRlciIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0Iiwib3duS2V5cyIsImUiLCJyIiwidCIsIk9iamVjdCIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJvIiwiZmlsdGVyIiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJmb3JFYWNoIiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJkZWZpbmVQcm9wZXJ0eSIsImtleSIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImkiLCJfdG9QcmltaXRpdmUiLCJTdHJpbmciLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsImNhbGwiLCJUeXBlRXJyb3IiLCJOdW1iZXIiLCJVdGlscyIsIlBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvciIsIlBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciIsIlBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IiLCJQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvciIsIlBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciIsImxvZ2dlciIsImRlYnVnIiwiYXJncyIsImNvbmNhdCIsInNsaWNlIiwibG9nIiwiZ2V0TG9nZ2VyIiwicGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUiLCJ0eXBlIiwiY29udGVudHMiLCJKU09OIiwic3RyaW5naWZ5IiwiUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yIiwiJGd0IiwiJGx0IiwiJGd0ZSIsIiRsdGUiLCJtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXMiLCIkZGF5T2ZNb250aCIsIiRkYXlPZldlZWsiLCIkZGF5T2ZZZWFyIiwiJGlzb0RheU9mV2VlayIsIiRpc29XZWVrWWVhciIsIiRob3VyIiwiJG1pbnV0ZSIsIiRzZWNvbmQiLCIkbWlsbGlzZWNvbmQiLCIkbW9udGgiLCIkd2VlayIsIiR5ZWFyIiwidG9Qb3N0Z3Jlc1ZhbHVlIiwiX190eXBlIiwiaXNvIiwibmFtZSIsInRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlIiwicG9zdGdyZXNWYWx1ZSIsImNhc3RUeXBlIiwidW5kZWZpbmVkIiwidHJhbnNmb3JtVmFsdWUiLCJvYmplY3RJZCIsImVtcHR5Q0xQUyIsImZyZWV6ZSIsImZpbmQiLCJnZXQiLCJjb3VudCIsImNyZWF0ZSIsInVwZGF0ZSIsImRlbGV0ZSIsImFkZEZpZWxkIiwicHJvdGVjdGVkRmllbGRzIiwiZGVmYXVsdENMUFMiLCJ0b1BhcnNlU2NoZW1hIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2hhc2hlZF9wYXNzd29yZCIsIl93cGVybSIsIl9ycGVybSIsImNscHMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwidG9Qb3N0Z3Jlc1NjaGVtYSIsIl9wYXNzd29yZF9oaXN0b3J5IiwiaGFuZGxlRG90RmllbGRzIiwib2JqZWN0IiwiZmllbGROYW1lIiwiaW5kZXhPZiIsImNvbXBvbmVudHMiLCJzcGxpdCIsImZpcnN0Iiwic2hpZnQiLCJjdXJyZW50T2JqIiwibmV4dCIsIl9fb3AiLCJ0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyIsIm1hcCIsImNtcHQiLCJpbmRleCIsInRyYW5zZm9ybURvdEZpZWxkIiwiam9pbiIsInRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkIiwic3Vic3RyaW5nIiwidmFsaWRhdGVLZXlzIiwiaW5jbHVkZXMiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwiam9pblRhYmxlc0ZvclNjaGVtYSIsImxpc3QiLCJmaWVsZCIsImJ1aWxkV2hlcmVDbGF1c2UiLCJxdWVyeSIsImNhc2VJbnNlbnNpdGl2ZSIsInBhdHRlcm5zIiwidmFsdWVzIiwic29ydHMiLCJpc0FycmF5RmllbGQiLCJpbml0aWFsUGF0dGVybnNMZW5ndGgiLCJmaWVsZFZhbHVlIiwiJGV4aXN0cyIsImF1dGhEYXRhTWF0Y2giLCJtYXRjaCIsIiRpbiIsIiRyZWdleCIsIk1BWF9JTlRfUExVU19PTkUiLCJjbGF1c2VzIiwiY2xhdXNlVmFsdWVzIiwic3ViUXVlcnkiLCJjbGF1c2UiLCJwYXR0ZXJuIiwib3JPckFuZCIsIm5vdCIsIiRuZSIsImNvbnN0cmFpbnRGaWVsZE5hbWUiLCIkcmVsYXRpdmVUaW1lIiwiSU5WQUxJRF9KU09OIiwicG9pbnQiLCJsb25naXR1ZGUiLCJsYXRpdHVkZSIsIiRlcSIsImlzSW5Pck5pbiIsIkFycmF5IiwiaXNBcnJheSIsIiRuaW4iLCJpblBhdHRlcm5zIiwiYWxsb3dOdWxsIiwibGlzdEVsZW0iLCJsaXN0SW5kZXgiLCJjcmVhdGVDb25zdHJhaW50IiwiYmFzZUFycmF5Iiwibm90SW4iLCJfIiwiZmxhdE1hcCIsImVsdCIsIiRhbGwiLCJpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoIiwiaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSIsInByb2Nlc3NSZWdleFBhdHRlcm4iLCIkY29udGFpbmVkQnkiLCJhcnIiLCIkdGV4dCIsInNlYXJjaCIsIiRzZWFyY2giLCJsYW5ndWFnZSIsIiR0ZXJtIiwiJGxhbmd1YWdlIiwiJGNhc2VTZW5zaXRpdmUiLCIkZGlhY3JpdGljU2Vuc2l0aXZlIiwiJG5lYXJTcGhlcmUiLCJkaXN0YW5jZSIsIiRtYXhEaXN0YW5jZSIsImRpc3RhbmNlSW5LTSIsIiR3aXRoaW4iLCIkYm94IiwiYm94IiwibGVmdCIsImJvdHRvbSIsInJpZ2h0IiwidG9wIiwiJGdlb1dpdGhpbiIsIiRjZW50ZXJTcGhlcmUiLCJjZW50ZXJTcGhlcmUiLCJHZW9Qb2ludCIsIkdlb1BvaW50Q29kZXIiLCJpc1ZhbGlkSlNPTiIsIl92YWxpZGF0ZSIsImlzTmFOIiwiJHBvbHlnb24iLCJwb2x5Z29uIiwicG9pbnRzIiwiY29vcmRpbmF0ZXMiLCIkZ2VvSW50ZXJzZWN0cyIsIiRwb2ludCIsInJlZ2V4Iiwib3BlcmF0b3IiLCJvcHRzIiwiJG9wdGlvbnMiLCJyZW1vdmVXaGl0ZVNwYWNlIiwiY29udmVydFBvbHlnb25Ub1NRTCIsImNtcCIsInBnQ29tcGFyYXRvciIsInBhcnNlclJlc3VsdCIsInJlbGF0aXZlVGltZVRvRGF0ZSIsInN0YXR1cyIsInJlc3VsdCIsImNvbnNvbGUiLCJlcnJvciIsImluZm8iLCJPUEVSQVRJT05fRk9SQklEREVOIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiY29sbGVjdGlvblByZWZpeCIsImRhdGFiYXNlT3B0aW9ucyIsIm9wdGlvbnMiLCJfY29sbGVjdGlvblByZWZpeCIsImVuYWJsZVNjaGVtYUhvb2tzIiwic2NoZW1hQ2FjaGVUdGwiLCJjbGllbnQiLCJwZ3AiLCJjcmVhdGVDbGllbnQiLCJfY2xpZW50IiwiX29uY2hhbmdlIiwiX3BncCIsInV1aWR2NCIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJ3YXRjaCIsImNhbGxiYWNrIiwiY3JlYXRlRXhwbGFpbmFibGVRdWVyeSIsImFuYWx5emUiLCJoYW5kbGVTaHV0ZG93biIsIl9zdHJlYW0iLCJkb25lIiwiJHBvb2wiLCJlbmQiLCJfbGlzdGVuVG9TY2hlbWEiLCJjb25uZWN0IiwiZGlyZWN0Iiwib24iLCJkYXRhIiwicGF5bG9hZCIsInBhcnNlIiwic2VuZGVySWQiLCJub25lIiwiX25vdGlmeVNjaGVtYUNoYW5nZSIsImNhdGNoIiwiX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMiLCJjb25uIiwiY2xhc3NFeGlzdHMiLCJvbmUiLCJhIiwiZXhpc3RzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiQ0xQcyIsInRhc2siLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsInN1Ym1pdHRlZEluZGV4ZXMiLCJleGlzdGluZ0luZGV4ZXMiLCJzZWxmIiwiUHJvbWlzZSIsInJlc29sdmUiLCJfaWRfIiwiX2lkIiwiZGVsZXRlZEluZGV4ZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJJTlZBTElEX1FVRVJZIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJ0eCIsImNyZWF0ZUluZGV4ZXMiLCJkcm9wSW5kZXhlcyIsImNyZWF0ZUNsYXNzIiwicGFyc2VTY2hlbWEiLCJjcmVhdGVUYWJsZSIsImVyciIsImNvZGUiLCJkZXRhaWwiLCJEVVBMSUNBVEVfVkFMVUUiLCJ2YWx1ZXNBcnJheSIsInBhdHRlcm5zQXJyYXkiLCJhc3NpZ24iLCJfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQiLCJfZW1haWxfdmVyaWZ5X3Rva2VuIiwiX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0IiwiX2ZhaWxlZF9sb2dpbl9jb3VudCIsIl9wZXJpc2hhYmxlX3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwicmVsYXRpb25zIiwicGFyc2VUeXBlIiwicXMiLCJiYXRjaCIsImpvaW5UYWJsZSIsInNjaGVtYVVwZ3JhZGUiLCJjb2x1bW5zIiwiY29sdW1uX25hbWUiLCJuZXdDb2x1bW5zIiwiaXRlbSIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJwb3N0Z3Jlc1R5cGUiLCJhbnkiLCJwYXRoIiwidXBkYXRlRmllbGRPcHRpb25zIiwiZGVsZXRlQ2xhc3MiLCJvcGVyYXRpb25zIiwicmVzcG9uc2UiLCJoZWxwZXJzIiwidGhlbiIsImRlbGV0ZUFsbENsYXNzZXMiLCJfdGhpcyRfY2xpZW50Iiwibm93IiwiRGF0ZSIsImdldFRpbWUiLCJlbmRlZCIsInJlc3VsdHMiLCJqb2lucyIsInJlZHVjZSIsImNsYXNzZXMiLCJxdWVyaWVzIiwiZGVsZXRlRmllbGRzIiwiZmllbGROYW1lcyIsImlkeCIsImdldEFsbENsYXNzZXMiLCJyb3ciLCJnZXRDbGFzcyIsImNyZWF0ZU9iamVjdCIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29sdW1uc0FycmF5IiwiZ2VvUG9pbnRzIiwiYXV0aERhdGFBbHJlYWR5RXhpc3RzIiwiYXV0aERhdGEiLCJwcm92aWRlciIsInBvcCIsImluaXRpYWxWYWx1ZXMiLCJ2YWwiLCJ0ZXJtaW5hdGlvbiIsImdlb1BvaW50c0luamVjdHMiLCJsIiwiY29sdW1uc1BhdHRlcm4iLCJjb2wiLCJ2YWx1ZXNQYXR0ZXJuIiwicHJvbWlzZSIsIm9wcyIsInVuZGVybHlpbmdFcnJvciIsImNvbnN0cmFpbnQiLCJtYXRjaGVzIiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ3aGVyZSIsIk9CSkVDVF9OT1RfRk9VTkQiLCJmaW5kT25lQW5kVXBkYXRlIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cGRhdGVQYXR0ZXJucyIsIm9yaWdpbmFsVXBkYXRlIiwiZG90Tm90YXRpb25PcHRpb25zIiwiZ2VuZXJhdGUiLCJqc29uYiIsImxhc3RLZXkiLCJmaWVsZE5hbWVJbmRleCIsInN0ciIsImFtb3VudCIsIm9iamVjdHMiLCJrZXlzVG9JbmNyZW1lbnQiLCJrIiwiaW5jcmVtZW50UGF0dGVybnMiLCJjIiwia2V5c1RvRGVsZXRlIiwiZGVsZXRlUGF0dGVybnMiLCJwIiwidXBkYXRlT2JqZWN0IiwiZXhwZWN0ZWRUeXBlIiwicmVqZWN0Iiwid2hlcmVDbGF1c2UiLCJ1cHNlcnRPbmVPYmplY3QiLCJjcmVhdGVWYWx1ZSIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJleHBsYWluIiwiaGFzTGltaXQiLCJoYXNTa2lwIiwid2hlcmVQYXR0ZXJuIiwibGltaXRQYXR0ZXJuIiwic2tpcFBhdHRlcm4iLCJzb3J0UGF0dGVybiIsInNvcnRDb3B5Iiwic29ydGluZyIsInRyYW5zZm9ybUtleSIsIm1lbW8iLCJvcmlnaW5hbFF1ZXJ5IiwicG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0IiwidGFyZ2V0Q2xhc3MiLCJ5IiwieCIsImNvb3JkcyIsInVwZGF0ZWRDb29yZHMiLCJwYXJzZUZsb2F0IiwiY3JlYXRlZEF0IiwidG9JU09TdHJpbmciLCJ1cGRhdGVkQXQiLCJleHBpcmVzQXQiLCJlbnN1cmVVbmlxdWVuZXNzIiwiY29uc3RyYWludE5hbWUiLCJjb25zdHJhaW50UGF0dGVybnMiLCJtZXNzYWdlIiwicmVhZFByZWZlcmVuY2UiLCJlc3RpbWF0ZSIsImFwcHJveGltYXRlX3Jvd19jb3VudCIsImRpc3RpbmN0IiwiY29sdW1uIiwiaXNOZXN0ZWQiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybWVyIiwiY2hpbGQiLCJhZ2dyZWdhdGUiLCJwaXBlbGluZSIsImhpbnQiLCJjb3VudEZpZWxkIiwiZ3JvdXBWYWx1ZXMiLCJncm91cFBhdHRlcm4iLCJzdGFnZSIsIiRncm91cCIsImdyb3VwQnlGaWVsZHMiLCJhbGlhcyIsInNvdXJjZSIsIm9wZXJhdGlvbiIsIiRzdW0iLCIkbWF4IiwiJG1pbiIsIiRhdmciLCIkcHJvamVjdCIsIiRtYXRjaCIsIiRvciIsImNvbGxhcHNlIiwiZWxlbWVudCIsIm1hdGNoUGF0dGVybnMiLCIkbGltaXQiLCIkc2tpcCIsIiRzb3J0Iiwib3JkZXIiLCJ0cmltIiwiQm9vbGVhbiIsInBhcnNlSW50IiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInByb21pc2VzIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwiYWxsIiwic3FsIiwibWlzYyIsImpzb25PYmplY3RTZXRLZXlzIiwiYXJyYXkiLCJhZGQiLCJhZGRVbmlxdWUiLCJyZW1vdmUiLCJjb250YWluc0FsbCIsImNvbnRhaW5zQWxsUmVnZXgiLCJjb250YWlucyIsImN0eCIsImR1cmF0aW9uIiwiY3JlYXRlSW5kZXhlc0lmTmVlZGVkIiwiZ2V0SW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwidXBkYXRlRXN0aW1hdGVkQ291bnQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiZGVmYXVsdEluZGV4TmFtZSIsImluZGV4TmFtZU9wdGlvbnMiLCJzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uIiwiZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyIsImRlbGV0ZUlkZW1wb3RlbmN5RnVuY3Rpb24iLCJ0dGxPcHRpb25zIiwidHRsIiwiZXhwb3J0cyIsInVuaXF1ZSIsImFyIiwiZm91bmRJbmRleCIsInB0IiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZW5kc1dpdGgiLCJyZXBsYWNlIiwicyIsInN0YXJ0c1dpdGgiLCJsaXRlcmFsaXplUmVnZXhQYXJ0IiwiaXNTdGFydHNXaXRoUmVnZXgiLCJmaXJzdFZhbHVlc0lzUmVnZXgiLCJzb21lIiwiY3JlYXRlTGl0ZXJhbFJlZ2V4IiwicmVtYWluaW5nIiwiUmVnRXhwIiwibWF0Y2hlcjEiLCJyZXN1bHQxIiwicHJlZml4IiwibWF0Y2hlcjIiLCJyZXN1bHQyIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tICcuL1Bvc3RncmVzQ2xpZW50Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCBzcWwgZnJvbSAnLi9zcWwnO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuLi8uLi8uLi9VdGlscycpO1xuXG5jb25zdCBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IgPSAnNDJQMDEnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yID0gJzQyUDA3JztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IgPSAnNDI3MDEnO1xuY29uc3QgUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IgPSAnNDI3MDMnO1xuY29uc3QgUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yID0gJzIzNTA1JztcbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoJy4uLy4uLy4uL2xvZ2dlcicpO1xuXG5jb25zdCBkZWJ1ZyA9IGZ1bmN0aW9uICguLi5hcmdzOiBhbnkpIHtcbiAgYXJncyA9IFsnUEc6ICcgKyBhcmd1bWVudHNbMF1dLmNvbmNhdChhcmdzLnNsaWNlKDEsIGFyZ3MubGVuZ3RoKSk7XG4gIGNvbnN0IGxvZyA9IGxvZ2dlci5nZXRMb2dnZXIoKTtcbiAgbG9nLmRlYnVnLmFwcGx5KGxvZywgYXJncyk7XG59O1xuXG5jb25zdCBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSA9IHR5cGUgPT4ge1xuICBzd2l0Y2ggKHR5cGUudHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuICd0aW1lc3RhbXAgd2l0aCB0aW1lIHpvbmUnO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gJ3BvaW50JztcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiAncG9seWdvbic7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgaWYgKHR5cGUuY29udGVudHMgJiYgdHlwZS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJykge1xuICAgICAgICByZXR1cm4gJ3RleHRbXSc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gJ2pzb25iJztcbiAgICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgYG5vIHR5cGUgZm9yICR7SlNPTi5zdHJpbmdpZnkodHlwZSl9IHlldGA7XG4gIH1cbn07XG5cbmNvbnN0IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciA9IHtcbiAgJGd0OiAnPicsXG4gICRsdDogJzwnLFxuICAkZ3RlOiAnPj0nLFxuICAkbHRlOiAnPD0nLFxufTtcblxuY29uc3QgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzID0ge1xuICAkZGF5T2ZNb250aDogJ0RBWScsXG4gICRkYXlPZldlZWs6ICdET1cnLFxuICAkZGF5T2ZZZWFyOiAnRE9ZJyxcbiAgJGlzb0RheU9mV2VlazogJ0lTT0RPVycsXG4gICRpc29XZWVrWWVhcjogJ0lTT1lFQVInLFxuICAkaG91cjogJ0hPVVInLFxuICAkbWludXRlOiAnTUlOVVRFJyxcbiAgJHNlY29uZDogJ1NFQ09ORCcsXG4gICRtaWxsaXNlY29uZDogJ01JTExJU0VDT05EUycsXG4gICRtb250aDogJ01PTlRIJyxcbiAgJHdlZWs6ICdXRUVLJyxcbiAgJHllYXI6ICdZRUFSJyxcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5pc287XG4gICAgfVxuICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgcmV0dXJuIHZhbHVlLm5hbWU7XG4gICAgfVxuICB9XG4gIHJldHVybiB2YWx1ZTtcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlID0gdmFsdWUgPT4ge1xuICBjb25zdCBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlKTtcbiAgbGV0IGNhc3RUeXBlO1xuICBzd2l0Y2ggKHR5cGVvZiBwb3N0Z3Jlc1ZhbHVlKSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIGNhc3RUeXBlID0gJ2RvdWJsZSBwcmVjaXNpb24nO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICBjYXN0VHlwZSA9ICdib29sZWFuJztcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjYXN0VHlwZSA9IHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gY2FzdFR5cGU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICByZXR1cm4gdmFsdWUub2JqZWN0SWQ7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufTtcblxuLy8gRHVwbGljYXRlIGZyb20gdGhlbiBtb25nbyBhZGFwdGVyLi4uXG5jb25zdCBlbXB0eUNMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDoge30sXG4gIGdldDoge30sXG4gIGNvdW50OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY291bnQ6IHsgJyonOiB0cnVlIH0sXG4gIGNyZWF0ZTogeyAnKic6IHRydWUgfSxcbiAgdXBkYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBkZWxldGU6IHsgJyonOiB0cnVlIH0sXG4gIGFkZEZpZWxkOiB7ICcqJzogdHJ1ZSB9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHsgJyonOiBbXSB9LFxufSk7XG5cbmNvbnN0IHRvUGFyc2VTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cbiAgaWYgKHNjaGVtYS5maWVsZHMpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICB9XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGlmIChzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgY2xwcyA9IHsgLi4uZW1wdHlDTFBTLCAuLi5zY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH07XG4gIH1cbiAgbGV0IGluZGV4ZXMgPSB7fTtcbiAgaWYgKHNjaGVtYS5pbmRleGVzKSB7XG4gICAgaW5kZXhlcyA9IHsgLi4uc2NoZW1hLmluZGV4ZXMgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBjbHBzLFxuICAgIGluZGV4ZXMsXG4gIH07XG59O1xuXG5jb25zdCB0b1Bvc3RncmVzU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgaWYgKCFzY2hlbWEpIHtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG4gIHNjaGVtYS5maWVsZHMgPSBzY2hlbWEuZmllbGRzIHx8IHt9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBzY2hlbWEuZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gIH1cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGhhbmRsZURvdEZpZWxkcyA9IG9iamVjdCA9PiB7XG4gIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgb2JqZWN0W2ZpcnN0XSA9IG9iamVjdFtmaXJzdF0gfHwge307XG4gICAgICBsZXQgY3VycmVudE9iaiA9IG9iamVjdFtmaXJzdF07XG4gICAgICBsZXQgbmV4dDtcbiAgICAgIGxldCB2YWx1ZSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHZhbHVlID0gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uZC1hc3NpZ24gKi9cbiAgICAgIHdoaWxlICgobmV4dCA9IGNvbXBvbmVudHMuc2hpZnQoKSkpIHtcbiAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25kLWFzc2lnbiAqL1xuICAgICAgICBjdXJyZW50T2JqW25leHRdID0gY3VycmVudE9ialtuZXh0XSB8fCB7fTtcbiAgICAgICAgaWYgKGNvbXBvbmVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY3VycmVudE9ialtuZXh0XSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRPYmogPSBjdXJyZW50T2JqW25leHRdO1xuICAgICAgfVxuICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyA9IGZpZWxkTmFtZSA9PiB7XG4gIHJldHVybiBmaWVsZE5hbWUuc3BsaXQoJy4nKS5tYXAoKGNtcHQsIGluZGV4KSA9PiB7XG4gICAgaWYgKGluZGV4ID09PSAwKSB7XG4gICAgICByZXR1cm4gYFwiJHtjbXB0fVwiYDtcbiAgICB9XG4gICAgcmV0dXJuIGAnJHtjbXB0fSdgO1xuICB9KTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPT09IC0xKSB7XG4gICAgcmV0dXJuIGBcIiR7ZmllbGROYW1lfVwiYDtcbiAgfVxuICBjb25zdCBjb21wb25lbnRzID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKTtcbiAgbGV0IG5hbWUgPSBjb21wb25lbnRzLnNsaWNlKDAsIGNvbXBvbmVudHMubGVuZ3RoIC0gMSkuam9pbignLT4nKTtcbiAgbmFtZSArPSAnLT4+JyArIGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIG5hbWU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCA9IGZpZWxkTmFtZSA9PiB7XG4gIGlmICh0eXBlb2YgZmllbGROYW1lICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBmaWVsZE5hbWU7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfY3JlYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ2NyZWF0ZWRBdCc7XG4gIH1cbiAgaWYgKGZpZWxkTmFtZSA9PT0gJyRfdXBkYXRlZF9hdCcpIHtcbiAgICByZXR1cm4gJ3VwZGF0ZWRBdCc7XG4gIH1cbiAgcmV0dXJuIGZpZWxkTmFtZS5zdWJzdHJpbmcoMSk7XG59O1xuXG5jb25zdCB2YWxpZGF0ZUtleXMgPSBvYmplY3QgPT4ge1xuICBpZiAodHlwZW9mIG9iamVjdCA9PSAnb2JqZWN0Jykge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgICAgaWYgKHR5cGVvZiBvYmplY3Rba2V5XSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB2YWxpZGF0ZUtleXMob2JqZWN0W2tleV0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoa2V5LmluY2x1ZGVzKCckJykgfHwga2V5LmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfTkVTVEVEX0tFWSxcbiAgICAgICAgICBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIFJldHVybnMgdGhlIGxpc3Qgb2Ygam9pbiB0YWJsZXMgb24gYSBzY2hlbWFcbmNvbnN0IGpvaW5UYWJsZXNGb3JTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBjb25zdCBsaXN0ID0gW107XG4gIGlmIChzY2hlbWEpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGxpc3QucHVzaChgX0pvaW46JHtmaWVsZH06JHtzY2hlbWEuY2xhc3NOYW1lfWApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBsaXN0O1xufTtcblxuaW50ZXJmYWNlIFdoZXJlQ2xhdXNlIHtcbiAgcGF0dGVybjogc3RyaW5nO1xuICB2YWx1ZXM6IEFycmF5PGFueT47XG4gIHNvcnRzOiBBcnJheTxhbnk+O1xufVxuXG5jb25zdCBidWlsZFdoZXJlQ2xhdXNlID0gKHsgc2NoZW1hLCBxdWVyeSwgaW5kZXgsIGNhc2VJbnNlbnNpdGl2ZSB9KTogV2hlcmVDbGF1c2UgPT4ge1xuICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICBsZXQgdmFsdWVzID0gW107XG4gIGNvbnN0IHNvcnRzID0gW107XG5cbiAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBxdWVyeSkge1xuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpbml0aWFsUGF0dGVybnNMZW5ndGggPSBwYXR0ZXJucy5sZW5ndGg7XG4gICAgY29uc3QgZmllbGRWYWx1ZSA9IHF1ZXJ5W2ZpZWxkTmFtZV07XG5cbiAgICAvLyBub3RoaW5nIGluIHRoZSBzY2hlbWEsIGl0J3MgZ29ubmEgYmxvdyB1cFxuICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAvLyBhcyBpdCB3b24ndCBleGlzdFxuICAgICAgaWYgKGZpZWxkVmFsdWUgJiYgZmllbGRWYWx1ZS4kZXhpc3RzID09PSBmYWxzZSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAvLyBUT0RPOiBIYW5kbGUgcXVlcnlpbmcgYnkgX2F1dGhfZGF0YV9wcm92aWRlciwgYXV0aERhdGEgaXMgc3RvcmVkIGluIGF1dGhEYXRhIGZpZWxkXG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKGNhc2VJbnNlbnNpdGl2ZSAmJiAoZmllbGROYW1lID09PSAndXNlcm5hbWUnIHx8IGZpZWxkTmFtZSA9PT0gJ2VtYWlsJykpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYExPV0VSKCQke2luZGV4fTpuYW1lKSA9IExPV0VSKCQke2luZGV4ICsgMX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgbGV0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKG5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRpbikge1xuICAgICAgICAgIG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpyYXcpOjpqc29uYiBAPiAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKG5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUuJGluKSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgICAgIC8vIEhhbmRsZSBsYXRlclxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgPSAkJHtpbmRleCArIDF9Ojp0ZXh0YCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCB8fCBmaWVsZFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIC8vIENhbid0IGNhc3QgYm9vbGVhbiB0byBkb3VibGUgcHJlY2lzaW9uXG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnTnVtYmVyJykge1xuICAgICAgICAvLyBTaG91bGQgYWx3YXlzIHJldHVybiB6ZXJvIHJlc3VsdHNcbiAgICAgICAgY29uc3QgTUFYX0lOVF9QTFVTX09ORSA9IDkyMjMzNzIwMzY4NTQ3NzU4MDg7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgTUFYX0lOVF9QTFVTX09ORSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgfVxuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKFsnJG9yJywgJyRub3InLCAnJGFuZCddLmluY2x1ZGVzKGZpZWxkTmFtZSkpIHtcbiAgICAgIGNvbnN0IGNsYXVzZXMgPSBbXTtcbiAgICAgIGNvbnN0IGNsYXVzZVZhbHVlcyA9IFtdO1xuICAgICAgZmllbGRWYWx1ZS5mb3JFYWNoKHN1YlF1ZXJ5ID0+IHtcbiAgICAgICAgY29uc3QgY2xhdXNlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgIHF1ZXJ5OiBzdWJRdWVyeSxcbiAgICAgICAgICBpbmRleCxcbiAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoY2xhdXNlLnBhdHRlcm4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNsYXVzZXMucHVzaChjbGF1c2UucGF0dGVybik7XG4gICAgICAgICAgY2xhdXNlVmFsdWVzLnB1c2goLi4uY2xhdXNlLnZhbHVlcyk7XG4gICAgICAgICAgaW5kZXggKz0gY2xhdXNlLnZhbHVlcy5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBvck9yQW5kID0gZmllbGROYW1lID09PSAnJGFuZCcgPyAnIEFORCAnIDogJyBPUiAnO1xuICAgICAgY29uc3Qgbm90ID0gZmllbGROYW1lID09PSAnJG5vcicgPyAnIE5PVCAnIDogJyc7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCR7bm90fSgke2NsYXVzZXMuam9pbihvck9yQW5kKX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaCguLi5jbGF1c2VWYWx1ZXMpO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIGZpZWxkVmFsdWUuJG5lID0gSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWUuJG5lXSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYE5PVCBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZSA9PT0gbnVsbCkge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIGlmIG5vdCBudWxsLCB3ZSBuZWVkIHRvIG1hbnVhbGx5IGV4Y2x1ZGUgbnVsbFxuICAgICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSkgT1IgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTClgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGNhc3RUeXBlID0gdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUoZmllbGRWYWx1ZS4kbmUpO1xuICAgICAgICAgICAgICBjb25zdCBjb25zdHJhaW50RmllbGROYW1lID0gY2FzdFR5cGVcbiAgICAgICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgICBgKCR7Y29uc3RyYWludEZpZWxkTmFtZX0gPD4gJCR7aW5kZXggKyAxfSBPUiAke2NvbnN0cmFpbnRGaWVsZE5hbWV9IElTIE5VTEwpYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmUgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJG5lLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9Om5hbWUgPD4gJCR7aW5kZXggKyAxfSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVE9ETzogc3VwcG9ydCBhcnJheXNcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRuZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChmaWVsZFZhbHVlLiRlcSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kZXEgPT09IG51bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgIGNvbnN0IGNhc3RUeXBlID0gdG9Qb3N0Z3Jlc1ZhbHVlQ2FzdFR5cGUoZmllbGRWYWx1ZS4kZXEpO1xuICAgICAgICAgIGNvbnN0IGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJHtjb25zdHJhaW50RmllbGROYW1lfSA9ICQke2luZGV4Kyt9YCk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGVxID09PSAnb2JqZWN0JyAmJiBmaWVsZFZhbHVlLiRlcS4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBpc0luT3JOaW4gPSBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGluKSB8fCBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJG5pbik7XG4gICAgaWYgKFxuICAgICAgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRpbikgJiZcbiAgICAgIGlzQXJyYXlGaWVsZCAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmNvbnRlbnRzICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uY29udGVudHMudHlwZSA9PT0gJ1N0cmluZydcbiAgICApIHtcbiAgICAgIGNvbnN0IGluUGF0dGVybnMgPSBbXTtcbiAgICAgIGxldCBhbGxvd051bGwgPSBmYWxzZTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBmaWVsZFZhbHVlLiRpbi5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgIGlmIChsaXN0RWxlbSA9PT0gbnVsbCkge1xuICAgICAgICAgIGFsbG93TnVsbCA9IHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4IC0gKGFsbG93TnVsbCA/IDEgOiAwKX1gKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoYWxsb3dOdWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06bmFtZSBJUyBOVUxMIE9SICQke2luZGV4fTpuYW1lICYmIEFSUkFZWyR7aW5QYXR0ZXJucy5qb2luKCl9XSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICYmIEFSUkFZWyR7aW5QYXR0ZXJucy5qb2luKCl9XWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDEgKyBpblBhdHRlcm5zLmxlbmd0aDtcbiAgICB9IGVsc2UgaWYgKGlzSW5Pck5pbikge1xuICAgICAgdmFyIGNyZWF0ZUNvbnN0cmFpbnQgPSAoYmFzZUFycmF5LCBub3RJbikgPT4ge1xuICAgICAgICBjb25zdCBub3QgPSBub3RJbiA/ICcgTk9UICcgOiAnJztcbiAgICAgICAgaWYgKGJhc2VBcnJheS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJHtub3R9IGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShiYXNlQXJyYXkpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEhhbmRsZSBOZXN0ZWQgRG90IE5vdGF0aW9uIEFib3ZlXG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGluUGF0dGVybnMgPSBbXTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICBiYXNlQXJyYXkuZm9yRWFjaCgobGlzdEVsZW0sIGxpc3RJbmRleCkgPT4ge1xuICAgICAgICAgICAgICBpZiAobGlzdEVsZW0gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGxpc3RFbGVtKTtcbiAgICAgICAgICAgICAgICBpblBhdHRlcm5zLnB1c2goYCQke2luZGV4ICsgMSArIGxpc3RJbmRleH1gKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAke25vdH0gSU4gKCR7aW5QYXR0ZXJucy5qb2luKCl9KWApO1xuICAgICAgICAgICAgaW5kZXggPSBpbmRleCArIDEgKyBpblBhdHRlcm5zLmxlbmd0aDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoIW5vdEluKSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICAgICAgaW5kZXggPSBpbmRleCArIDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSGFuZGxlIGVtcHR5IGFycmF5XG4gICAgICAgICAgaWYgKG5vdEluKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKCcxID0gMScpOyAvLyBSZXR1cm4gYWxsIHZhbHVlc1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKCcxID0gMicpOyAvLyBSZXR1cm4gbm8gdmFsdWVzXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgaWYgKGZpZWxkVmFsdWUuJGluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJGluLCBlbHQgPT4gZWx0KSxcbiAgICAgICAgICBmYWxzZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkVmFsdWUuJG5pbikge1xuICAgICAgICBjcmVhdGVDb25zdHJhaW50KFxuICAgICAgICAgIF8uZmxhdE1hcChmaWVsZFZhbHVlLiRuaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRpbiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGluIHZhbHVlJyk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kbmluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkbmluIHZhbHVlJyk7XG4gICAgfVxuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kYWxsKSAmJiBpc0FycmF5RmllbGQpIHtcbiAgICAgIGlmIChpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgaWYgKCFpc0FsbFZhbHVlc1JlZ2V4T3JOb25lKGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnQWxsICRhbGwgdmFsdWVzIG11c3QgYmUgb2YgcmVnZXggdHlwZSBvciBub25lOiAnICsgZmllbGRWYWx1ZS4kYWxsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRWYWx1ZS4kYWxsLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBwcm9jZXNzUmVnZXhQYXR0ZXJuKGZpZWxkVmFsdWUuJGFsbFtpXS4kcmVnZXgpO1xuICAgICAgICAgIGZpZWxkVmFsdWUuJGFsbFtpXSA9IHZhbHVlLnN1YnN0cmluZygxKSArICclJztcbiAgICAgICAgfVxuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWluc19hbGxfcmVnZXgoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX06Ompzb25iKWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgYXJyYXlfY29udGFpbnNfYWxsKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9Ojpqc29uYilgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS4kYWxsKSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpKSB7XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kYWxsLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRhbGxbMF0ub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kZXhpc3RzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRleGlzdHMgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJGV4aXN0cy4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJyRyZWxhdGl2ZVRpbWUgY2FuIG9ubHkgYmUgdXNlZCB3aXRoIHRoZSAkbHQsICRsdGUsICRndCwgYW5kICRndGUgb3BlcmF0b3JzJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLiRleGlzdHMpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRjb250YWluZWRCeSkge1xuICAgICAgY29uc3QgYXJyID0gZmllbGRWYWx1ZS4kY29udGFpbmVkQnk7XG4gICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkY29udGFpbmVkQnk6IHNob3VsZCBiZSBhbiBhcnJheWApO1xuICAgICAgfVxuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA8QCAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShhcnIpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHRleHQpIHtcbiAgICAgIGNvbnN0IHNlYXJjaCA9IGZpZWxkVmFsdWUuJHRleHQuJHNlYXJjaDtcbiAgICAgIGxldCBsYW5ndWFnZSA9ICdlbmdsaXNoJztcbiAgICAgIGlmICh0eXBlb2Ygc2VhcmNoICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkc2VhcmNoLCBzaG91bGQgYmUgb2JqZWN0YCk7XG4gICAgICB9XG4gICAgICBpZiAoIXNlYXJjaC4kdGVybSB8fCB0eXBlb2Ygc2VhcmNoLiR0ZXJtICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICR0ZXh0OiAkdGVybSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UgJiYgdHlwZW9mIHNlYXJjaC4kbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRsYW5ndWFnZSwgc2hvdWxkIGJlIHN0cmluZ2ApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGxhbmd1YWdlKSB7XG4gICAgICAgIGxhbmd1YWdlID0gc2VhcmNoLiRsYW5ndWFnZTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSBub3Qgc3VwcG9ydGVkLCBwbGVhc2UgdXNlICRyZWdleCBvciBjcmVhdGUgYSBzZXBhcmF0ZSBsb3dlciBjYXNlIGNvbHVtbi5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSAtIGZhbHNlIG5vdCBzdXBwb3J0ZWQsIGluc3RhbGwgUG9zdGdyZXMgVW5hY2NlbnQgRXh0ZW5zaW9uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYHRvX3RzdmVjdG9yKCQke2luZGV4fSwgJCR7aW5kZXggKyAxfTpuYW1lKSBAQCB0b190c3F1ZXJ5KCQke2luZGV4ICsgMn0sICQke2luZGV4ICsgM30pYFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGxhbmd1YWdlLCBmaWVsZE5hbWUsIGxhbmd1YWdlLCBzZWFyY2guJHRlcm0pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kbmVhclNwaGVyZSkge1xuICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRuZWFyU3BoZXJlO1xuICAgICAgY29uc3QgZGlzdGFuY2UgPSBmaWVsZFZhbHVlLiRtYXhEaXN0YW5jZTtcbiAgICAgIGNvbnN0IGRpc3RhbmNlSW5LTSA9IGRpc3RhbmNlICogNjM3MSAqIDEwMDA7XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgU1RfRGlzdGFuY2VTcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtcbiAgICAgICAgICBpbmRleCArIDJcbiAgICAgICAgfSk6Omdlb21ldHJ5KSA8PSAkJHtpbmRleCArIDN9YFxuICAgICAgKTtcbiAgICAgIHNvcnRzLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIEFTQ2BcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiR3aXRoaW4gJiYgZmllbGRWYWx1ZS4kd2l0aGluLiRib3gpIHtcbiAgICAgIGNvbnN0IGJveCA9IGZpZWxkVmFsdWUuJHdpdGhpbi4kYm94O1xuICAgICAgY29uc3QgbGVmdCA9IGJveFswXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCBib3R0b20gPSBib3hbMF0ubGF0aXR1ZGU7XG4gICAgICBjb25zdCByaWdodCA9IGJveFsxXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCB0b3AgPSBib3hbMV0ubGF0aXR1ZGU7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpib3hgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgoJHtsZWZ0fSwgJHtib3R0b219KSwgKCR7cmlnaHR9LCAke3RvcH0pKWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kY2VudGVyU3BoZXJlKSB7XG4gICAgICBjb25zdCBjZW50ZXJTcGhlcmUgPSBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJGNlbnRlclNwaGVyZTtcbiAgICAgIGlmICghKGNlbnRlclNwaGVyZSBpbnN0YW5jZW9mIEFycmF5KSB8fCBjZW50ZXJTcGhlcmUubGVuZ3RoIDwgMikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBzaG91bGQgYmUgYW4gYXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQgYW5kIGRpc3RhbmNlJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gR2V0IHBvaW50LCBjb252ZXJ0IHRvIGdlbyBwb2ludCBpZiBuZWNlc3NhcnkgYW5kIHZhbGlkYXRlXG4gICAgICBsZXQgcG9pbnQgPSBjZW50ZXJTcGhlcmVbMF07XG4gICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgcG9pbnQgPSBuZXcgUGFyc2UuR2VvUG9pbnQocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgIH0gZWxzZSBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGdlbyBwb2ludCBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgLy8gR2V0IGRpc3RhbmNlIGFuZCB2YWxpZGF0ZVxuICAgICAgY29uc3QgZGlzdGFuY2UgPSBjZW50ZXJTcGhlcmVbMV07XG4gICAgICBpZiAoaXNOYU4oZGlzdGFuY2UpIHx8IGRpc3RhbmNlIDwgMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBkaXN0YW5jZSBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIDw9ICQke2luZGV4ICsgM31gXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBwb2ludC5sb25naXR1ZGUsIHBvaW50LmxhdGl0dWRlLCBkaXN0YW5jZUluS00pO1xuICAgICAgaW5kZXggKz0gNDtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kcG9seWdvbikge1xuICAgICAgY29uc3QgcG9seWdvbiA9IGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kcG9seWdvbjtcbiAgICAgIGxldCBwb2ludHM7XG4gICAgICBpZiAodHlwZW9mIHBvbHlnb24gPT09ICdvYmplY3QnICYmIHBvbHlnb24uX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgaWYgKCFwb2x5Z29uLmNvb3JkaW5hdGVzIHx8IHBvbHlnb24uY29vcmRpbmF0ZXMubGVuZ3RoIDwgMykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgUG9seWdvbi5jb29yZGluYXRlcyBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIGxvbi9sYXQgcGFpcnMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwb2ludHMgPSBwb2x5Z29uLmNvb3JkaW5hdGVzO1xuICAgICAgfSBlbHNlIGlmIChwb2x5Z29uIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgaWYgKHBvbHlnb24ubGVuZ3RoIDwgMykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJHBvbHlnb24gc2hvdWxkIGNvbnRhaW4gYXQgbGVhc3QgMyBHZW9Qb2ludHMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwb2ludHMgPSBwb2x5Z29uO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBcImJhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgYmUgUG9seWdvbiBvYmplY3Qgb3IgQXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQnc1wiXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBwb2ludHMgPSBwb2ludHNcbiAgICAgICAgLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgaWYgKHBvaW50IGluc3RhbmNlb2YgQXJyYXkgJiYgcG9pbnQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgICAgICAgIHJldHVybiBgKCR7cG9pbnRbMF19LCAke3BvaW50WzFdfSlgO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodHlwZW9mIHBvaW50ICE9PSAnb2JqZWN0JyB8fCBwb2ludC5fX3R5cGUgIT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdiYWQgJGdlb1dpdGhpbiB2YWx1ZScpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgKCR7cG9pbnQubG9uZ2l0dWRlfSwgJHtwb2ludC5sYXRpdHVkZX0pYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oJywgJyk7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoJHtwb2ludHN9KWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG4gICAgaWYgKGZpZWxkVmFsdWUuJGdlb0ludGVyc2VjdHMgJiYgZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cy4kcG9pbnQpIHtcbiAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cy4kcG9pbnQ7XG4gICAgICBpZiAodHlwZW9mIHBvaW50ICE9PSAnb2JqZWN0JyB8fCBwb2ludC5fX3R5cGUgIT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9JbnRlcnNlY3QgdmFsdWU7ICRwb2ludCBzaG91bGQgYmUgR2VvUG9pbnQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICB9XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZTo6cG9seWdvbiBAPiAkJHtpbmRleCArIDF9Ojpwb2ludGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCR7cG9pbnQubG9uZ2l0dWRlfSwgJHtwb2ludC5sYXRpdHVkZX0pYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRyZWdleCkge1xuICAgICAgbGV0IHJlZ2V4ID0gZmllbGRWYWx1ZS4kcmVnZXg7XG4gICAgICBsZXQgb3BlcmF0b3IgPSAnfic7XG4gICAgICBjb25zdCBvcHRzID0gZmllbGRWYWx1ZS4kb3B0aW9ucztcbiAgICAgIGlmIChvcHRzKSB7XG4gICAgICAgIGlmIChvcHRzLmluZGV4T2YoJ2knKSA+PSAwKSB7XG4gICAgICAgICAgb3BlcmF0b3IgPSAnfionO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRzLmluZGV4T2YoJ3gnKSA+PSAwKSB7XG4gICAgICAgICAgcmVnZXggPSByZW1vdmVXaGl0ZVNwYWNlKHJlZ2V4KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBuYW1lID0gdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgIHJlZ2V4ID0gcHJvY2Vzc1JlZ2V4UGF0dGVybihyZWdleCk7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpyYXcgJHtvcGVyYXRvcn0gJyQke2luZGV4ICsgMX06cmF3J2ApO1xuICAgICAgdmFsdWVzLnB1c2gobmFtZSwgcmVnZXgpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgaWYgKGlzQXJyYXlGaWVsZCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShbZmllbGRWYWx1ZV0pKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUub2JqZWN0SWQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5pc28pO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUubG9uZ2l0dWRlLCBmaWVsZFZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGluZGV4ICs9IDM7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIH49ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBPYmplY3Qua2V5cyhQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3IpLmZvckVhY2goY21wID0+IHtcbiAgICAgIGlmIChmaWVsZFZhbHVlW2NtcF0gfHwgZmllbGRWYWx1ZVtjbXBdID09PSAwKSB7XG4gICAgICAgIGNvbnN0IHBnQ29tcGFyYXRvciA9IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcltjbXBdO1xuICAgICAgICBsZXQgY29uc3RyYWludEZpZWxkTmFtZTtcbiAgICAgICAgbGV0IHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZVtjbXBdKTtcblxuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlW2NtcF0pO1xuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgPyBgQ0FTVCAoKCR7dHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKX0pIEFTICR7Y2FzdFR5cGV9KWBcbiAgICAgICAgICAgIDogdHJhbnNmb3JtRG90RmllbGQoZmllbGROYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHBvc3RncmVzVmFsdWUgPT09ICdvYmplY3QnICYmIHBvc3RncmVzVmFsdWUuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlICE9PSAnRGF0ZScpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggRGF0ZSBmaWVsZCdcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHBhcnNlclJlc3VsdCA9IFV0aWxzLnJlbGF0aXZlVGltZVRvRGF0ZShwb3N0Z3Jlc1ZhbHVlLiRyZWxhdGl2ZVRpbWUpO1xuICAgICAgICAgICAgaWYgKHBhcnNlclJlc3VsdC5zdGF0dXMgPT09ICdzdWNjZXNzJykge1xuICAgICAgICAgICAgICBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHBhcnNlclJlc3VsdC5yZXN1bHQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igd2hpbGUgcGFyc2luZyByZWxhdGl2ZSBkYXRlJywgcGFyc2VyUmVzdWx0KTtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgICBgYmFkICRyZWxhdGl2ZVRpbWUgKCR7cG9zdGdyZXNWYWx1ZS4kcmVsYXRpdmVUaW1lfSkgdmFsdWUuICR7cGFyc2VyUmVzdWx0LmluZm99YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdHJhaW50RmllbGROYW1lID0gYCQke2luZGV4Kyt9Om5hbWVgO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsdWVzLnB1c2gocG9zdGdyZXNWYWx1ZSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCR7Y29uc3RyYWludEZpZWxkTmFtZX0gJHtwZ0NvbXBhcmF0b3J9ICQke2luZGV4Kyt9YCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoaW5pdGlhbFBhdHRlcm5zTGVuZ3RoID09PSBwYXR0ZXJucy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB0aGlzIHF1ZXJ5IHR5cGUgeWV0ICR7SlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSl9YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbiAgdmFsdWVzID0gdmFsdWVzLm1hcCh0cmFuc2Zvcm1WYWx1ZSk7XG4gIHJldHVybiB7IHBhdHRlcm46IHBhdHRlcm5zLmpvaW4oJyBBTkQgJyksIHZhbHVlcywgc29ydHMgfTtcbn07XG5cbmV4cG9ydCBjbGFzcyBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGltcGxlbWVudHMgU3RvcmFnZUFkYXB0ZXIge1xuICBjYW5Tb3J0T25Kb2luVGFibGVzOiBib29sZWFuO1xuICBlbmFibGVTY2hlbWFIb29rczogYm9vbGVhbjtcblxuICAvLyBQcml2YXRlXG4gIF9jb2xsZWN0aW9uUHJlZml4OiBzdHJpbmc7XG4gIF9jbGllbnQ6IGFueTtcbiAgX29uY2hhbmdlOiBhbnk7XG4gIF9wZ3A6IGFueTtcbiAgX3N0cmVhbTogYW55O1xuICBfdXVpZDogYW55O1xuICBzY2hlbWFDYWNoZVR0bDogP251bWJlcjtcblxuICBjb25zdHJ1Y3Rvcih7IHVyaSwgY29sbGVjdGlvblByZWZpeCA9ICcnLCBkYXRhYmFzZU9wdGlvbnMgPSB7fSB9OiBhbnkpIHtcbiAgICBjb25zdCBvcHRpb25zID0geyAuLi5kYXRhYmFzZU9wdGlvbnMgfTtcbiAgICB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ID0gY29sbGVjdGlvblByZWZpeDtcbiAgICB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzID0gISFkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3M7XG4gICAgdGhpcy5zY2hlbWFDYWNoZVR0bCA9IGRhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bDtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBbJ2VuYWJsZVNjaGVtYUhvb2tzJywgJ3NjaGVtYUNhY2hlVHRsJ10pIHtcbiAgICAgIGRlbGV0ZSBvcHRpb25zW2tleV07XG4gICAgfVxuXG4gICAgY29uc3QgeyBjbGllbnQsIHBncCB9ID0gY3JlYXRlQ2xpZW50KHVyaSwgb3B0aW9ucyk7XG4gICAgdGhpcy5fY2xpZW50ID0gY2xpZW50O1xuICAgIHRoaXMuX29uY2hhbmdlID0gKCkgPT4ge307XG4gICAgdGhpcy5fcGdwID0gcGdwO1xuICAgIHRoaXMuX3V1aWQgPSB1dWlkdjQoKTtcbiAgICB0aGlzLmNhblNvcnRPbkpvaW5UYWJsZXMgPSBmYWxzZTtcbiAgfVxuXG4gIHdhdGNoKGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSBjYWxsYmFjaztcbiAgfVxuXG4gIC8vTm90ZSB0aGF0IGFuYWx5emU9dHJ1ZSB3aWxsIHJ1biB0aGUgcXVlcnksIGV4ZWN1dGluZyBJTlNFUlRTLCBERUxFVEVTLCBldGMuXG4gIGNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkocXVlcnk6IHN0cmluZywgYW5hbHl6ZTogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgaWYgKGFuYWx5emUpIHtcbiAgICAgIHJldHVybiAnRVhQTEFJTiAoQU5BTFlaRSwgRk9STUFUIEpTT04pICcgKyBxdWVyeTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuICdFWFBMQUlOIChGT1JNQVQgSlNPTikgJyArIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGlmICh0aGlzLl9zdHJlYW0pIHtcbiAgICAgIHRoaXMuX3N0cmVhbS5kb25lKCk7XG4gICAgICBkZWxldGUgdGhpcy5fc3RyZWFtO1xuICAgIH1cbiAgICBpZiAoIXRoaXMuX2NsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLl9jbGllbnQuJHBvb2wuZW5kKCk7XG4gIH1cblxuICBhc3luYyBfbGlzdGVuVG9TY2hlbWEoKSB7XG4gICAgaWYgKCF0aGlzLl9zdHJlYW0gJiYgdGhpcy5lbmFibGVTY2hlbWFIb29rcykge1xuICAgICAgdGhpcy5fc3RyZWFtID0gYXdhaXQgdGhpcy5fY2xpZW50LmNvbm5lY3QoeyBkaXJlY3Q6IHRydWUgfSk7XG4gICAgICB0aGlzLl9zdHJlYW0uY2xpZW50Lm9uKCdub3RpZmljYXRpb24nLCBkYXRhID0+IHtcbiAgICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoZGF0YS5wYXlsb2FkKTtcbiAgICAgICAgaWYgKHBheWxvYWQuc2VuZGVySWQgIT09IHRoaXMuX3V1aWQpIHtcbiAgICAgICAgICB0aGlzLl9vbmNoYW5nZSgpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHRoaXMuX3N0cmVhbS5ub25lKCdMSVNURU4gJDF+JywgJ3NjaGVtYS5jaGFuZ2UnKTtcbiAgICB9XG4gIH1cblxuICBfbm90aWZ5U2NoZW1hQ2hhbmdlKCkge1xuICAgIGlmICh0aGlzLl9zdHJlYW0pIHtcbiAgICAgIHRoaXMuX3N0cmVhbVxuICAgICAgICAubm9uZSgnTk9USUZZICQxfiwgJDInLCBbJ3NjaGVtYS5jaGFuZ2UnLCB7IHNlbmRlcklkOiB0aGlzLl91dWlkIH1dKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gTm90aWZ5OicsIGVycm9yKTsgLy8gdW5saWtlbHkgdG8gZXZlciBoYXBwZW5cbiAgICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMoY29ubjogYW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGF3YWl0IGNvbm5cbiAgICAgIC5ub25lKFxuICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgXCJfU0NIRU1BXCIgKCBcImNsYXNzTmFtZVwiIHZhckNoYXIoMTIwKSwgXCJzY2hlbWFcIiBqc29uYiwgXCJpc1BhcnNlQ2xhc3NcIiBib29sLCBQUklNQVJZIEtFWSAoXCJjbGFzc05hbWVcIikgKSdcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBjbGFzc0V4aXN0cyhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50Lm9uZShcbiAgICAgICdTRUxFQ1QgRVhJU1RTIChTRUxFQ1QgMSBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXMgV0hFUkUgdGFibGVfbmFtZSA9ICQxKScsXG4gICAgICBbbmFtZV0sXG4gICAgICBhID0+IGEuZXhpc3RzXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZywgQ0xQczogYW55KSB7XG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnRhc2soJ3NldC1jbGFzcy1sZXZlbC1wZXJtaXNzaW9ucycsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgJ3NjaGVtYScsICdjbGFzc0xldmVsUGVybWlzc2lvbnMnLCBKU09OLnN0cmluZ2lmeShDTFBzKV07XG4gICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgIGBVUERBVEUgXCJfU0NIRU1BXCIgU0VUICQyOm5hbWUgPSBqc29uX29iamVjdF9zZXRfa2V5KCQyOm5hbWUsICQzOjp0ZXh0LCAkNDo6anNvbmIpIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMWAsXG4gICAgICAgIHZhbHVlc1xuICAgICAgKTtcbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIGFzeW5jIHNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEluZGV4ZXM6IGFueSxcbiAgICBleGlzdGluZ0luZGV4ZXM6IGFueSA9IHt9LFxuICAgIGZpZWxkczogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGlmIChzdWJtaXR0ZWRJbmRleGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKGV4aXN0aW5nSW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgICBleGlzdGluZ0luZGV4ZXMgPSB7IF9pZF86IHsgX2lkOiAxIH0gfTtcbiAgICB9XG4gICAgY29uc3QgZGVsZXRlZEluZGV4ZXMgPSBbXTtcbiAgICBjb25zdCBpbnNlcnRlZEluZGV4ZXMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRJbmRleGVzKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzdWJtaXR0ZWRJbmRleGVzW25hbWVdO1xuICAgICAgaWYgKGV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgYEluZGV4ICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmApO1xuICAgICAgfVxuICAgICAgaWYgKCFleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEluZGV4ICR7bmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIGRlbGV0ZWRJbmRleGVzLnB1c2gobmFtZSk7XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0luZGV4ZXNbbmFtZV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBPYmplY3Qua2V5cyhmaWVsZCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGZpZWxkcywga2V5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgICBgRmllbGQgJHtrZXl9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgYWRkIGluZGV4LmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgZXhpc3RpbmdJbmRleGVzW25hbWVdID0gZmllbGQ7XG4gICAgICAgIGluc2VydGVkSW5kZXhlcy5wdXNoKHtcbiAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgIG5hbWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGF3YWl0IGNvbm4udHgoJ3NldC1pbmRleGVzLXdpdGgtc2NoZW1hLWZvcm1hdCcsIGFzeW5jIHQgPT4ge1xuICAgICAgaWYgKGluc2VydGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGF3YWl0IHNlbGYuY3JlYXRlSW5kZXhlcyhjbGFzc05hbWUsIGluc2VydGVkSW5kZXhlcywgdCk7XG4gICAgICB9XG4gICAgICBpZiAoZGVsZXRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBzZWxmLmRyb3BJbmRleGVzKGNsYXNzTmFtZSwgZGVsZXRlZEluZGV4ZXMsIHQpO1xuICAgICAgfVxuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDEnLFxuICAgICAgICBbY2xhc3NOYW1lLCAnc2NoZW1hJywgJ2luZGV4ZXMnLCBKU09OLnN0cmluZ2lmeShleGlzdGluZ0luZGV4ZXMpXVxuICAgICAgKTtcbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46ID9hbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgcGFyc2VTY2hlbWEgPSBhd2FpdCBjb25uXG4gICAgICAudHgoJ2NyZWF0ZS1jbGFzcycsIGFzeW5jIHQgPT4ge1xuICAgICAgICBhd2FpdCB0aGlzLmNyZWF0ZVRhYmxlKGNsYXNzTmFtZSwgc2NoZW1hLCB0KTtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdJTlNFUlQgSU5UTyBcIl9TQ0hFTUFcIiAoXCJjbGFzc05hbWVcIiwgXCJzY2hlbWFcIiwgXCJpc1BhcnNlQ2xhc3NcIikgVkFMVUVTICgkPGNsYXNzTmFtZT4sICQ8c2NoZW1hPiwgdHJ1ZSknLFxuICAgICAgICAgIHsgY2xhc3NOYW1lLCBzY2hlbWEgfVxuICAgICAgICApO1xuICAgICAgICBhd2FpdCB0aGlzLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KGNsYXNzTmFtZSwgc2NoZW1hLmluZGV4ZXMsIHt9LCBzY2hlbWEuZmllbGRzLCB0KTtcbiAgICAgICAgcmV0dXJuIHRvUGFyc2VTY2hlbWEoc2NoZW1hKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiYgZXJyLmRldGFpbC5pbmNsdWRlcyhjbGFzc05hbWUpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgICByZXR1cm4gcGFyc2VTY2hlbWE7XG4gIH1cblxuICAvLyBKdXN0IGNyZWF0ZSBhIHRhYmxlLCBkbyBub3QgaW5zZXJ0IGluIHNjaGVtYVxuICBhc3luYyBjcmVhdGVUYWJsZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBjb25uID0gY29ubiB8fCB0aGlzLl9jbGllbnQ7XG4gICAgZGVidWcoJ2NyZWF0ZVRhYmxlJyk7XG4gICAgY29uc3QgdmFsdWVzQXJyYXkgPSBbXTtcbiAgICBjb25zdCBwYXR0ZXJuc0FycmF5ID0gW107XG4gICAgY29uc3QgZmllbGRzID0gT2JqZWN0LmFzc2lnbih7fSwgc2NoZW1hLmZpZWxkcyk7XG4gICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgZmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIGZpZWxkcy5fYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9mYWlsZWRfbG9naW5fY291bnQgPSB7IHR5cGU6ICdOdW1iZXInIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW4gPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICBmaWVsZHMuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gICAgfVxuICAgIGxldCBpbmRleCA9IDI7XG4gICAgY29uc3QgcmVsYXRpb25zID0gW107XG4gICAgT2JqZWN0LmtleXMoZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBjb25zdCBwYXJzZVR5cGUgPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICAgIC8vIFNraXAgd2hlbiBpdCdzIGEgcmVsYXRpb25cbiAgICAgIC8vIFdlJ2xsIGNyZWF0ZSB0aGUgdGFibGVzIGxhdGVyXG4gICAgICBpZiAocGFyc2VUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgcmVsYXRpb25zLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHBhcnNlVHlwZS5jb250ZW50cyA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIH1cbiAgICAgIHZhbHVlc0FycmF5LnB1c2goZmllbGROYW1lKTtcbiAgICAgIHZhbHVlc0FycmF5LnB1c2gocGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUocGFyc2VUeXBlKSk7XG4gICAgICBwYXR0ZXJuc0FycmF5LnB1c2goYCQke2luZGV4fTpuYW1lICQke2luZGV4ICsgMX06cmF3YCk7XG4gICAgICBpZiAoZmllbGROYW1lID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIHBhdHRlcm5zQXJyYXkucHVzaChgUFJJTUFSWSBLRVkgKCQke2luZGV4fTpuYW1lKWApO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBpbmRleCArIDI7XG4gICAgfSk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDE6bmFtZSAoJHtwYXR0ZXJuc0FycmF5LmpvaW4oKX0pYDtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi52YWx1ZXNBcnJheV07XG5cbiAgICByZXR1cm4gY29ubi50YXNrKCdjcmVhdGUtdGFibGUnLCBhc3luYyB0ID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShxcywgdmFsdWVzKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICAvLyBFTFNFOiBUYWJsZSBhbHJlYWR5IGV4aXN0cywgbXVzdCBoYXZlIGJlZW4gY3JlYXRlZCBieSBhIGRpZmZlcmVudCByZXF1ZXN0LiBJZ25vcmUgdGhlIGVycm9yLlxuICAgICAgfVxuICAgICAgYXdhaXQgdC50eCgnY3JlYXRlLXRhYmxlLXR4JywgdHggPT4ge1xuICAgICAgICByZXR1cm4gdHguYmF0Y2goXG4gICAgICAgICAgcmVsYXRpb25zLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHR4Lm5vbmUoXG4gICAgICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzY2hlbWFVcGdyYWRlKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGNvbm46IGFueSkge1xuICAgIGRlYnVnKCdzY2hlbWFVcGdyYWRlJyk7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgYXdhaXQgY29ubi50YXNrKCdzY2hlbWEtdXBncmFkZScsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgY29sdW1ucyA9IGF3YWl0IHQubWFwKFxuICAgICAgICAnU0VMRUNUIGNvbHVtbl9uYW1lIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgV0hFUkUgdGFibGVfbmFtZSA9ICQ8Y2xhc3NOYW1lPicsXG4gICAgICAgIHsgY2xhc3NOYW1lIH0sXG4gICAgICAgIGEgPT4gYS5jb2x1bW5fbmFtZVxuICAgICAgKTtcbiAgICAgIGNvbnN0IG5ld0NvbHVtbnMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gY29sdW1ucy5pbmRleE9mKGl0ZW0pID09PSAtMSlcbiAgICAgICAgLm1hcChmaWVsZE5hbWUgPT4gc2VsZi5hZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pKTtcblxuICAgICAgYXdhaXQgdC5iYXRjaChuZXdDb2x1bW5zKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICAvLyBUT0RPOiBNdXN0IGJlIHJldmlzZWQgZm9yIGludmFsaWQgbG9naWMuLi5cbiAgICBkZWJ1ZygnYWRkRmllbGRJZk5vdEV4aXN0cycpO1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgnYWRkLWZpZWxkLWlmLW5vdC1leGlzdHMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGlmICh0eXBlLnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgICAnQUxURVIgVEFCTEUgJDxjbGFzc05hbWU6bmFtZT4gQUREIENPTFVNTiBJRiBOT1QgRVhJU1RTICQ8ZmllbGROYW1lOm5hbWU+ICQ8cG9zdGdyZXNUeXBlOnJhdz4nLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICAgICAgcG9zdGdyZXNUeXBlOiBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSh0eXBlKSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBzZWxmLmNyZWF0ZUNsYXNzKGNsYXNzTmFtZSwgeyBmaWVsZHM6IHsgW2ZpZWxkTmFtZV06IHR5cGUgfSB9LCB0KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBDb2x1bW4gYWxyZWFkeSBleGlzdHMsIGNyZWF0ZWQgYnkgb3RoZXIgcmVxdWVzdC4gQ2Fycnkgb24gdG8gc2VlIGlmIGl0J3MgdGhlIHJpZ2h0IHR5cGUuXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDxqb2luVGFibGU6bmFtZT4gKFwicmVsYXRlZElkXCIgdmFyQ2hhcigxMjApLCBcIm93bmluZ0lkXCIgdmFyQ2hhcigxMjApLCBQUklNQVJZIEtFWShcInJlbGF0ZWRJZFwiLCBcIm93bmluZ0lkXCIpICknLFxuICAgICAgICAgIHsgam9pblRhYmxlOiBgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWAgfVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0LmFueShcbiAgICAgICAgJ1NFTEVDVCBcInNjaGVtYVwiIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPiBhbmQgKFwic2NoZW1hXCI6Ompzb24tPlxcJ2ZpZWxkc1xcJy0+JDxmaWVsZE5hbWU+KSBpcyBub3QgbnVsbCcsXG4gICAgICAgIHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUgfVxuICAgICAgKTtcblxuICAgICAgaWYgKHJlc3VsdFswXSkge1xuICAgICAgICB0aHJvdyAnQXR0ZW1wdGVkIHRvIGFkZCBhIGZpZWxkIHRoYXQgYWxyZWFkeSBleGlzdHMnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcGF0aCA9IGB7ZmllbGRzLCR7ZmllbGROYW1lfX1gO1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIj1qc29uYl9zZXQoXCJzY2hlbWFcIiwgJDxwYXRoPiwgJDx0eXBlPikgIFdIRVJFIFwiY2xhc3NOYW1lXCI9JDxjbGFzc05hbWU+JyxcbiAgICAgICAgICB7IHBhdGgsIHR5cGUsIGNsYXNzTmFtZSB9XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudHgoJ3VwZGF0ZS1zY2hlbWEtZmllbGQtb3B0aW9ucycsIGFzeW5jIHQgPT4ge1xuICAgICAgY29uc3QgcGF0aCA9IGB7ZmllbGRzLCR7ZmllbGROYW1lfX1gO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiPWpzb25iX3NldChcInNjaGVtYVwiLCAkPHBhdGg+LCAkPHR5cGU+KSAgV0hFUkUgXCJjbGFzc05hbWVcIj0kPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IHBhdGgsIHR5cGUsIGNsYXNzTmFtZSB9XG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gRHJvcHMgYSBjb2xsZWN0aW9uLiBSZXNvbHZlcyB3aXRoIHRydWUgaWYgaXQgd2FzIGEgUGFyc2UgU2NoZW1hIChlZy4gX1VzZXIsIEN1c3RvbSwgZXRjLilcbiAgLy8gYW5kIHJlc29sdmVzIHdpdGggZmFsc2UgaWYgaXQgd2Fzbid0IChlZy4gYSBqb2luIHRhYmxlKS4gUmVqZWN0cyBpZiBkZWxldGlvbiB3YXMgaW1wb3NzaWJsZS5cbiAgYXN5bmMgZGVsZXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBvcGVyYXRpb25zID0gW1xuICAgICAgeyBxdWVyeTogYERST1AgVEFCTEUgSUYgRVhJU1RTICQxOm5hbWVgLCB2YWx1ZXM6IFtjbGFzc05hbWVdIH0sXG4gICAgICB7XG4gICAgICAgIHF1ZXJ5OiBgREVMRVRFIEZST00gXCJfU0NIRU1BXCIgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxYCxcbiAgICAgICAgdmFsdWVzOiBbY2xhc3NOYW1lXSxcbiAgICAgIH0sXG4gICAgXTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX2NsaWVudFxuICAgICAgLnR4KHQgPT4gdC5ub25lKHRoaXMuX3BncC5oZWxwZXJzLmNvbmNhdChvcGVyYXRpb25zKSkpXG4gICAgICAudGhlbigoKSA9PiBjbGFzc05hbWUuaW5kZXhPZignX0pvaW46JykgIT0gMCk7IC8vIHJlc29sdmVzIHdpdGggZmFsc2Ugd2hlbiBfSm9pbiB0YWJsZVxuXG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG5cbiAgLy8gRGVsZXRlIGFsbCBkYXRhIGtub3duIHRvIHRoaXMgYWRhcHRlci4gVXNlZCBmb3IgdGVzdGluZy5cbiAgYXN5bmMgZGVsZXRlQWxsQ2xhc3NlcygpIHtcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICBjb25zdCBoZWxwZXJzID0gdGhpcy5fcGdwLmhlbHBlcnM7XG4gICAgZGVidWcoJ2RlbGV0ZUFsbENsYXNzZXMnKTtcbiAgICBpZiAodGhpcy5fY2xpZW50Py4kcG9vbC5lbmRlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLl9jbGllbnRcbiAgICAgIC50YXNrKCdkZWxldGUtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdC5hbnkoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInKTtcbiAgICAgICAgICBjb25zdCBqb2lucyA9IHJlc3VsdHMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBzY2hlbWE6IGFueSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGxpc3QuY29uY2F0KGpvaW5UYWJsZXNGb3JTY2hlbWEoc2NoZW1hLnNjaGVtYSkpO1xuICAgICAgICAgIH0sIFtdKTtcbiAgICAgICAgICBjb25zdCBjbGFzc2VzID0gW1xuICAgICAgICAgICAgJ19TQ0hFTUEnLFxuICAgICAgICAgICAgJ19QdXNoU3RhdHVzJyxcbiAgICAgICAgICAgICdfSm9iU3RhdHVzJyxcbiAgICAgICAgICAgICdfSm9iU2NoZWR1bGUnLFxuICAgICAgICAgICAgJ19Ib29rcycsXG4gICAgICAgICAgICAnX0dsb2JhbENvbmZpZycsXG4gICAgICAgICAgICAnX0dyYXBoUUxDb25maWcnLFxuICAgICAgICAgICAgJ19BdWRpZW5jZScsXG4gICAgICAgICAgICAnX0lkZW1wb3RlbmN5JyxcbiAgICAgICAgICAgIC4uLnJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQuY2xhc3NOYW1lKSxcbiAgICAgICAgICAgIC4uLmpvaW5zLFxuICAgICAgICAgIF07XG4gICAgICAgICAgY29uc3QgcXVlcmllcyA9IGNsYXNzZXMubWFwKGNsYXNzTmFtZSA9PiAoe1xuICAgICAgICAgICAgcXVlcnk6ICdEUk9QIFRBQkxFIElGIEVYSVNUUyAkPGNsYXNzTmFtZTpuYW1lPicsXG4gICAgICAgICAgICB2YWx1ZXM6IHsgY2xhc3NOYW1lIH0sXG4gICAgICAgICAgfSkpO1xuICAgICAgICAgIGF3YWl0IHQudHgodHggPT4gdHgubm9uZShoZWxwZXJzLmNvbmNhdChxdWVyaWVzKSkpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBObyBfU0NIRU1BIGNvbGxlY3Rpb24uIERvbid0IGRlbGV0ZSBhbnl0aGluZy5cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgZGVidWcoYGRlbGV0ZUFsbENsYXNzZXMgZG9uZSBpbiAke25ldyBEYXRlKCkuZ2V0VGltZSgpIC0gbm93fWApO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZW1vdmUgdGhlIGNvbHVtbiBhbmQgYWxsIHRoZSBkYXRhLiBGb3IgUmVsYXRpb25zLCB0aGUgX0pvaW4gY29sbGVjdGlvbiBpcyBoYW5kbGVkXG4gIC8vIHNwZWNpYWxseSwgdGhpcyBmdW5jdGlvbiBkb2VzIG5vdCBkZWxldGUgX0pvaW4gY29sdW1ucy4gSXQgc2hvdWxkLCBob3dldmVyLCBpbmRpY2F0ZVxuICAvLyB0aGF0IHRoZSByZWxhdGlvbiBmaWVsZHMgZG9lcyBub3QgZXhpc3QgYW55bW9yZS4gSW4gbW9uZ28sIHRoaXMgbWVhbnMgcmVtb3ZpbmcgaXQgZnJvbVxuICAvLyB0aGUgX1NDSEVNQSBjb2xsZWN0aW9uLiAgVGhlcmUgc2hvdWxkIGJlIG5vIGFjdHVhbCBkYXRhIGluIHRoZSBjb2xsZWN0aW9uIHVuZGVyIHRoZSBzYW1lIG5hbWVcbiAgLy8gYXMgdGhlIHJlbGF0aW9uIGNvbHVtbiwgc28gaXQncyBmaW5lIHRvIGF0dGVtcHQgdG8gZGVsZXRlIGl0LiBJZiB0aGUgZmllbGRzIGxpc3RlZCB0byBiZVxuICAvLyBkZWxldGVkIGRvIG5vdCBleGlzdCwgdGhpcyBmdW5jdGlvbiBzaG91bGQgcmV0dXJuIHN1Y2Nlc3NmdWxseSBhbnl3YXlzLiBDaGVja2luZyBmb3JcbiAgLy8gYXR0ZW1wdHMgdG8gZGVsZXRlIG5vbi1leGlzdGVudCBmaWVsZHMgaXMgdGhlIHJlc3BvbnNpYmlsaXR5IG9mIFBhcnNlIFNlcnZlci5cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIG5vdCBvYmxpZ2F0ZWQgdG8gZGVsZXRlIGZpZWxkcyBhdG9taWNhbGx5LiBJdCBpcyBnaXZlbiB0aGUgZmllbGRcbiAgLy8gbmFtZXMgaW4gYSBsaXN0IHNvIHRoYXQgZGF0YWJhc2VzIHRoYXQgYXJlIGNhcGFibGUgb2YgZGVsZXRpbmcgZmllbGRzIGF0b21pY2FsbHlcbiAgLy8gbWF5IGRvIHNvLlxuXG4gIC8vIFJldHVybnMgYSBQcm9taXNlLlxuICBhc3luYyBkZWxldGVGaWVsZHMoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBkZWJ1ZygnZGVsZXRlRmllbGRzJyk7XG4gICAgZmllbGROYW1lcyA9IGZpZWxkTmFtZXMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBmaWVsZE5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoZmllbGQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBsaXN0LnB1c2goZmllbGROYW1lKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gbGlzdDtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXTtcbiAgICBjb25zdCBjb2x1bW5zID0gZmllbGROYW1lc1xuICAgICAgLm1hcCgobmFtZSwgaWR4KSA9PiB7XG4gICAgICAgIHJldHVybiBgJCR7aWR4ICsgMn06bmFtZWA7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywgRFJPUCBDT0xVTU4nKTtcblxuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50eCgnZGVsZXRlLWZpZWxkcycsIGFzeW5jIHQgPT4ge1xuICAgICAgYXdhaXQgdC5ub25lKCdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCIgPSAkPHNjaGVtYT4gV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQ8Y2xhc3NOYW1lPicsIHtcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICB9KTtcbiAgICAgIGlmICh2YWx1ZXMubGVuZ3RoID4gMSkge1xuICAgICAgICBhd2FpdCB0Lm5vbmUoYEFMVEVSIFRBQkxFICQxOm5hbWUgRFJPUCBDT0xVTU4gSUYgRVhJU1RTICR7Y29sdW1uc31gLCB2YWx1ZXMpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgYWxsIHNjaGVtYXMga25vd24gdG8gdGhpcyBhZGFwdGVyLCBpbiBQYXJzZSBmb3JtYXQuIEluIGNhc2UgdGhlXG4gIC8vIHNjaGVtYXMgY2Fubm90IGJlIHJldHJpZXZlZCwgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZWplY3RzLiBSZXF1aXJlbWVudHMgZm9yIHRoZVxuICAvLyByZWplY3Rpb24gcmVhc29uIGFyZSBUQkQuXG4gIGFzeW5jIGdldEFsbENsYXNzZXMoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC50YXNrKCdnZXQtYWxsLWNsYXNzZXMnLCBhc3luYyB0ID0+IHtcbiAgICAgIHJldHVybiBhd2FpdCB0Lm1hcCgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIicsIG51bGwsIHJvdyA9PlxuICAgICAgICB0b1BhcnNlU2NoZW1hKHsgY2xhc3NOYW1lOiByb3cuY2xhc3NOYW1lLCAuLi5yb3cuc2NoZW1hIH0pXG4gICAgICApO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgdGhlIHNjaGVtYSB3aXRoIHRoZSBnaXZlbiBuYW1lLCBpbiBQYXJzZSBmb3JtYXQuIElmXG4gIC8vIHRoaXMgYWRhcHRlciBkb2Vzbid0IGtub3cgYWJvdXQgdGhlIHNjaGVtYSwgcmV0dXJuIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2l0aFxuICAvLyB1bmRlZmluZWQgYXMgdGhlIHJlYXNvbi5cbiAgYXN5bmMgZ2V0Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBkZWJ1ZygnZ2V0Q2xhc3MnKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4nLCB7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAocmVzdWx0Lmxlbmd0aCAhPT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0WzBdLnNjaGVtYTtcbiAgICAgIH0pXG4gICAgICAudGhlbih0b1BhcnNlU2NoZW1hKTtcbiAgfVxuXG4gIC8vIFRPRE86IHJlbW92ZSB0aGUgbW9uZ28gZm9ybWF0IGRlcGVuZGVuY3kgaW4gdGhlIHJldHVybiB2YWx1ZVxuICBhc3luYyBjcmVhdGVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIG9iamVjdDogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdjcmVhdGVPYmplY3QnKTtcbiAgICBsZXQgY29sdW1uc0FycmF5ID0gW107XG4gICAgY29uc3QgdmFsdWVzQXJyYXkgPSBbXTtcbiAgICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgZ2VvUG9pbnRzID0ge307XG5cbiAgICBvYmplY3QgPSBoYW5kbGVEb3RGaWVsZHMob2JqZWN0KTtcblxuICAgIHZhbGlkYXRlS2V5cyhvYmplY3QpO1xuXG4gICAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdmFyIGF1dGhEYXRhTWF0Y2ggPSBmaWVsZE5hbWUubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICAgIGNvbnN0IGF1dGhEYXRhQWxyZWFkeUV4aXN0cyA9ICEhb2JqZWN0LmF1dGhEYXRhO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgb2JqZWN0WydhdXRoRGF0YSddID0gb2JqZWN0WydhdXRoRGF0YSddIHx8IHt9O1xuICAgICAgICBvYmplY3RbJ2F1dGhEYXRhJ11bcHJvdmlkZXJdID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgZmllbGROYW1lID0gJ2F1dGhEYXRhJztcbiAgICAgICAgLy8gQXZvaWQgYWRkaW5nIGF1dGhEYXRhIG11bHRpcGxlIHRpbWVzIHRvIHRoZSBxdWVyeVxuICAgICAgICBpZiAoYXV0aERhdGFBbHJlYWR5RXhpc3RzKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbHVtbnNBcnJheS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19lbWFpbF92ZXJpZnlfdG9rZW4nIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2ZhaWxlZF9sb2dpbl9jb3VudCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGVyaXNoYWJsZV90b2tlbicgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGFzc3dvcmRfaGlzdG9yeSdcbiAgICAgICAgKSB7XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZmllbGROYW1lID09PSAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0Jykge1xuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCcgfHxcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfcGFzc3dvcmRfY2hhbmdlZF9hdCdcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHN3aXRjaCAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUpIHtcbiAgICAgICAgY2FzZSAnRGF0ZSc6XG4gICAgICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLmlzbyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLm9iamVjdElkKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQXJyYXknOlxuICAgICAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2goSlNPTi5zdHJpbmdpZnkob2JqZWN0W2ZpZWxkTmFtZV0pKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0ubmFtZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1BvbHlnb24nOiB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKG9iamVjdFtmaWVsZE5hbWVdLmNvb3JkaW5hdGVzKTtcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKHZhbHVlKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICAgICAgLy8gcG9wIHRoZSBwb2ludCBhbmQgcHJvY2VzcyBsYXRlclxuICAgICAgICAgIGdlb1BvaW50c1tmaWVsZE5hbWVdID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgICAgY29sdW1uc0FycmF5LnBvcCgpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHRocm93IGBUeXBlICR7c2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGV9IG5vdCBzdXBwb3J0ZWQgeWV0YDtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbHVtbnNBcnJheSA9IGNvbHVtbnNBcnJheS5jb25jYXQoT2JqZWN0LmtleXMoZ2VvUG9pbnRzKSk7XG4gICAgY29uc3QgaW5pdGlhbFZhbHVlcyA9IHZhbHVlc0FycmF5Lm1hcCgodmFsLCBpbmRleCkgPT4ge1xuICAgICAgbGV0IHRlcm1pbmF0aW9uID0gJyc7XG4gICAgICBjb25zdCBmaWVsZE5hbWUgPSBjb2x1bW5zQXJyYXlbaW5kZXhdO1xuICAgICAgaWYgKFsnX3JwZXJtJywgJ193cGVybSddLmluZGV4T2YoZmllbGROYW1lKSA+PSAwKSB7XG4gICAgICAgIHRlcm1pbmF0aW9uID0gJzo6dGV4dFtdJztcbiAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgIHRlcm1pbmF0aW9uID0gJzo6anNvbmInO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGAkJHtpbmRleCArIDIgKyBjb2x1bW5zQXJyYXkubGVuZ3RofSR7dGVybWluYXRpb259YDtcbiAgICB9KTtcbiAgICBjb25zdCBnZW9Qb2ludHNJbmplY3RzID0gT2JqZWN0LmtleXMoZ2VvUG9pbnRzKS5tYXAoa2V5ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gZ2VvUG9pbnRzW2tleV07XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKHZhbHVlLmxvbmdpdHVkZSwgdmFsdWUubGF0aXR1ZGUpO1xuICAgICAgY29uc3QgbCA9IHZhbHVlc0FycmF5Lmxlbmd0aCArIGNvbHVtbnNBcnJheS5sZW5ndGg7XG4gICAgICByZXR1cm4gYFBPSU5UKCQke2x9LCAkJHtsICsgMX0pYDtcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbHVtbnNQYXR0ZXJuID0gY29sdW1uc0FycmF5Lm1hcCgoY29sLCBpbmRleCkgPT4gYCQke2luZGV4ICsgMn06bmFtZWApLmpvaW4oKTtcbiAgICBjb25zdCB2YWx1ZXNQYXR0ZXJuID0gaW5pdGlhbFZhbHVlcy5jb25jYXQoZ2VvUG9pbnRzSW5qZWN0cykuam9pbigpO1xuXG4gICAgY29uc3QgcXMgPSBgSU5TRVJUIElOVE8gJDE6bmFtZSAoJHtjb2x1bW5zUGF0dGVybn0pIFZBTFVFUyAoJHt2YWx1ZXNQYXR0ZXJufSlgO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLmNvbHVtbnNBcnJheSwgLi4udmFsdWVzQXJyYXldO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KVxuICAgICAgLm5vbmUocXMsIHZhbHVlcylcbiAgICAgIC50aGVuKCgpID0+ICh7IG9wczogW29iamVjdF0gfSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yKSB7XG4gICAgICAgICAgY29uc3QgZXJyID0gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgICBlcnIudW5kZXJseWluZ0Vycm9yID0gZXJyb3I7XG4gICAgICAgICAgaWYgKGVycm9yLmNvbnN0cmFpbnQpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBlcnJvci5jb25zdHJhaW50Lm1hdGNoKC91bmlxdWVfKFthLXpBLVpdKykvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzICYmIEFycmF5LmlzQXJyYXkobWF0Y2hlcykpIHtcbiAgICAgICAgICAgICAgZXJyLnVzZXJJbmZvID0geyBkdXBsaWNhdGVkX2ZpZWxkOiBtYXRjaGVzWzFdIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGVycm9yID0gZXJyO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIFJlbW92ZSBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgLy8gSWYgbm8gb2JqZWN0cyBtYXRjaCwgcmVqZWN0IHdpdGggT0JKRUNUX05PVF9GT1VORC4gSWYgb2JqZWN0cyBhcmUgZm91bmQgYW5kIGRlbGV0ZWQsIHJlc29sdmUgd2l0aCB1bmRlZmluZWQuXG4gIC8vIElmIHRoZXJlIGlzIHNvbWUgb3RoZXIgZXJyb3IsIHJlamVjdCB3aXRoIElOVEVSTkFMX1NFUlZFUl9FUlJPUi5cbiAgYXN5bmMgZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ2RlbGV0ZU9iamVjdHNCeVF1ZXJ5Jyk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3QgaW5kZXggPSAyO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBpbmRleCxcbiAgICAgIHF1ZXJ5LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuICAgIGlmIChPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAwKSB7XG4gICAgICB3aGVyZS5wYXR0ZXJuID0gJ1RSVUUnO1xuICAgIH1cbiAgICBjb25zdCBxcyA9IGBXSVRIIGRlbGV0ZWQgQVMgKERFTEVURSBGUk9NICQxOm5hbWUgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufSBSRVRVUk5JTkcgKikgU0VMRUNUIGNvdW50KCopIEZST00gZGVsZXRlZGA7XG4gICAgY29uc3QgcHJvbWlzZSA9ICh0cmFuc2FjdGlvbmFsU2Vzc2lvbiA/IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgOiB0aGlzLl9jbGllbnQpXG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4gK2EuY291bnQpXG4gICAgICAudGhlbihjb3VudCA9PiB7XG4gICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gY291bnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogRG9uJ3QgZGVsZXRlIGFueXRoaW5nIGlmIGRvZXNuJ3QgZXhpc3RcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGFzeW5jIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBkZWJ1ZygnZmluZE9uZUFuZFVwZGF0ZScpO1xuICAgIHJldHVybiB0aGlzLnVwZGF0ZU9iamVjdHNCeVF1ZXJ5KGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgdXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikudGhlbihcbiAgICAgIHZhbCA9PiB2YWxbMF1cbiAgICApO1xuICB9XG5cbiAgLy8gQXBwbHkgdGhlIHVwZGF0ZSB0byBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgYXN5bmMgdXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKTogUHJvbWlzZTxbYW55XT4ge1xuICAgIGRlYnVnKCd1cGRhdGVPYmplY3RzQnlRdWVyeScpO1xuICAgIGNvbnN0IHVwZGF0ZVBhdHRlcm5zID0gW107XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4ID0gMjtcbiAgICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG5cbiAgICBjb25zdCBvcmlnaW5hbFVwZGF0ZSA9IHsgLi4udXBkYXRlIH07XG5cbiAgICAvLyBTZXQgZmxhZyBmb3IgZG90IG5vdGF0aW9uIGZpZWxkc1xuICAgIGNvbnN0IGRvdE5vdGF0aW9uT3B0aW9ucyA9IHt9O1xuICAgIE9iamVjdC5rZXlzKHVwZGF0ZSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAtMSkge1xuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gZmllbGROYW1lLnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IGZpcnN0ID0gY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgICBkb3ROb3RhdGlvbk9wdGlvbnNbZmlyc3RdID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaWVsZE5hbWVdID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdXBkYXRlID0gaGFuZGxlRG90RmllbGRzKHVwZGF0ZSk7XG4gICAgLy8gUmVzb2x2ZSBhdXRoRGF0YSBmaXJzdCxcbiAgICAvLyBTbyB3ZSBkb24ndCBlbmQgdXAgd2l0aCBtdWx0aXBsZSBrZXkgdXBkYXRlc1xuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgICAgdmFyIHByb3ZpZGVyID0gYXV0aERhdGFNYXRjaFsxXTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICB1cGRhdGVbJ2F1dGhEYXRhJ10gPSB1cGRhdGVbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiB1cGRhdGUpIHtcbiAgICAgIGNvbnN0IGZpZWxkVmFsdWUgPSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgIC8vIERyb3AgYW55IHVuZGVmaW5lZCB2YWx1ZXMuXG4gICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGRlbGV0ZSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09ICdhdXRoRGF0YScpIHtcbiAgICAgICAgLy8gVGhpcyByZWN1cnNpdmVseSBzZXRzIHRoZSBqc29uX29iamVjdFxuICAgICAgICAvLyBPbmx5IDEgbGV2ZWwgZGVlcFxuICAgICAgICBjb25zdCBnZW5lcmF0ZSA9IChqc29uYjogc3RyaW5nLCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSkgPT4ge1xuICAgICAgICAgIHJldHVybiBganNvbl9vYmplY3Rfc2V0X2tleShDT0FMRVNDRSgke2pzb25ifSwgJ3t9Jzo6anNvbmIpLCAke2tleX0sICR7dmFsdWV9KTo6anNvbmJgO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBsYXN0S2V5ID0gYCQke2luZGV4fTpuYW1lYDtcbiAgICAgICAgY29uc3QgZmllbGROYW1lSW5kZXggPSBpbmRleDtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgY29uc3QgdXBkYXRlID0gT2JqZWN0LmtleXMoZmllbGRWYWx1ZSkucmVkdWNlKChsYXN0S2V5OiBzdHJpbmcsIGtleTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgY29uc3Qgc3RyID0gZ2VuZXJhdGUobGFzdEtleSwgYCQke2luZGV4fTo6dGV4dGAsIGAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgbGV0IHZhbHVlID0gZmllbGRWYWx1ZVtrZXldO1xuICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICB2YWx1ZXMucHVzaChrZXksIHZhbHVlKTtcbiAgICAgICAgICByZXR1cm4gc3RyO1xuICAgICAgICB9LCBsYXN0S2V5KTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7ZmllbGROYW1lSW5kZXh9Om5hbWUgPSAke3VwZGF0ZX1gKTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnSW5jcmVtZW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAwKSArICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmFtb3VudCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0FkZCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9hZGQoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIG51bGwpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdSZW1vdmUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfcmVtb3ZlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke1xuICAgICAgICAgICAgaW5kZXggKyAxXG4gICAgICAgICAgfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdBZGRVbmlxdWUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfYWRkX3VuaXF1ZShDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGROYW1lID09PSAndXBkYXRlZEF0Jykge1xuICAgICAgICAvL1RPRE86IHN0b3Agc3BlY2lhbCBjYXNpbmcgdGhpcy4gSXQgc2hvdWxkIGNoZWNrIGZvciBfX3R5cGUgPT09ICdEYXRlJyBhbmQgdXNlIC5pc29cbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLm9iamVjdElkKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdEYXRlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB0b1Bvc3RncmVzVmFsdWUoZmllbGRWYWx1ZSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9IFBPSU5UKCQke2luZGV4ICsgMX0sICQke2luZGV4ICsgMn0pYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5sb25naXR1ZGUsIGZpZWxkVmFsdWUubGF0aXR1ZGUpO1xuICAgICAgICBpbmRleCArPSAzO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChmaWVsZFZhbHVlLmNvb3JkaW5hdGVzKTtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpwb2x5Z29uYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAvLyBub29wXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnbnVtYmVyJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIHR5cGVvZiBmaWVsZFZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdPYmplY3QnXG4gICAgICApIHtcbiAgICAgICAgLy8gR2F0aGVyIGtleXMgdG8gaW5jcmVtZW50XG4gICAgICAgIGNvbnN0IGtleXNUb0luY3JlbWVudCA9IE9iamVjdC5rZXlzKG9yaWdpbmFsVXBkYXRlKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldFxuICAgICAgICAgICAgLy8gTm90ZSB0aGF0IE9iamVjdC5rZXlzIGlzIGl0ZXJhdGluZyBvdmVyIHRoZSAqKm9yaWdpbmFsKiogdXBkYXRlIG9iamVjdFxuICAgICAgICAgICAgLy8gYW5kIHRoYXQgc29tZSBvZiB0aGUga2V5cyBvZiB0aGUgb3JpZ2luYWwgdXBkYXRlIGNvdWxkIGJlIG51bGwgb3IgdW5kZWZpbmVkOlxuICAgICAgICAgICAgLy8gKFNlZSB0aGUgYWJvdmUgY2hlY2sgYGlmIChmaWVsZFZhbHVlID09PSBudWxsIHx8IHR5cGVvZiBmaWVsZFZhbHVlID09IFwidW5kZWZpbmVkXCIpYClcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnSW5jcmVtZW50JyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcChrID0+IGsuc3BsaXQoJy4nKVsxXSk7XG5cbiAgICAgICAgbGV0IGluY3JlbWVudFBhdHRlcm5zID0gJyc7XG4gICAgICAgIGlmIChrZXlzVG9JbmNyZW1lbnQubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGluY3JlbWVudFBhdHRlcm5zID1cbiAgICAgICAgICAgICcgfHwgJyArXG4gICAgICAgICAgICBrZXlzVG9JbmNyZW1lbnRcbiAgICAgICAgICAgICAgLm1hcChjID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhbW91bnQgPSBmaWVsZFZhbHVlW2NdLmFtb3VudDtcbiAgICAgICAgICAgICAgICByZXR1cm4gYENPTkNBVCgne1wiJHtjfVwiOicsIENPQUxFU0NFKCQke2luZGV4fTpuYW1lLT4+JyR7Y30nLCcwJyk6OmludCArICR7YW1vdW50fSwgJ30nKTo6anNvbmJgO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAuam9pbignIHx8ICcpO1xuICAgICAgICAgIC8vIFN0cmlwIHRoZSBrZXlzXG4gICAgICAgICAga2V5c1RvSW5jcmVtZW50LmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICAgIGRlbGV0ZSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBrZXlzVG9EZWxldGU6IEFycmF5PHN0cmluZz4gPSBPYmplY3Qua2V5cyhvcmlnaW5hbFVwZGF0ZSlcbiAgICAgICAgICAuZmlsdGVyKGsgPT4ge1xuICAgICAgICAgICAgLy8gY2hvb3NlIHRvcCBsZXZlbCBmaWVsZHMgdGhhdCBoYXZlIGEgZGVsZXRlIG9wZXJhdGlvbiBzZXQuXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG9yaWdpbmFsVXBkYXRlW2tdO1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdmFsdWUgJiZcbiAgICAgICAgICAgICAgdmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpLmxlbmd0aCA9PT0gMiAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJylbMF0gPT09IGZpZWxkTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoayA9PiBrLnNwbGl0KCcuJylbMV0pO1xuXG4gICAgICAgIGNvbnN0IGRlbGV0ZVBhdHRlcm5zID0ga2V5c1RvRGVsZXRlLnJlZHVjZSgocDogc3RyaW5nLCBjOiBzdHJpbmcsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICAgIHJldHVybiBwICsgYCAtICckJHtpbmRleCArIDEgKyBpfTp2YWx1ZSdgO1xuICAgICAgICB9LCAnJyk7XG4gICAgICAgIC8vIE92ZXJyaWRlIE9iamVjdFxuICAgICAgICBsZXQgdXBkYXRlT2JqZWN0ID0gXCIne30nOjpqc29uYlwiO1xuXG4gICAgICAgIGlmIChkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSkge1xuICAgICAgICAgIC8vIE1lcmdlIE9iamVjdFxuICAgICAgICAgIHVwZGF0ZU9iamVjdCA9IGBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ3t9Jzo6anNvbmIpYDtcbiAgICAgICAgfVxuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9ICgke3VwZGF0ZU9iamVjdH0gJHtkZWxldGVQYXR0ZXJuc30gJHtpbmNyZW1lbnRQYXR0ZXJuc30gfHwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDEgKyBrZXlzVG9EZWxldGUubGVuZ3RoXG4gICAgICAgICAgfTo6anNvbmIgKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCAuLi5rZXlzVG9EZWxldGUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMiArIGtleXNUb0RlbGV0ZS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUpICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5J1xuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSk7XG4gICAgICAgIGlmIChleHBlY3RlZFR5cGUgPT09ICd0ZXh0W10nKSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojp0ZXh0W11gKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKCdOb3Qgc3VwcG9ydGVkIHVwZGF0ZScsIHsgZmllbGROYW1lLCBmaWVsZFZhbHVlIH0pO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgIGBQb3N0Z3JlcyBkb2Vzbid0IHN1cHBvcnQgdXBkYXRlICR7SlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSl9IHlldGBcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIGluZGV4LFxuICAgICAgcXVlcnksXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG5cbiAgICBjb25zdCB3aGVyZUNsYXVzZSA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IHFzID0gYFVQREFURSAkMTpuYW1lIFNFVCAke3VwZGF0ZVBhdHRlcm5zLmpvaW4oKX0gJHt3aGVyZUNsYXVzZX0gUkVUVVJOSU5HICpgO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KS5hbnkocXMsIHZhbHVlcyk7XG4gICAgaWYgKHRyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaC5wdXNoKHByb21pc2UpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIEhvcGVmdWxseSwgd2UgY2FuIGdldCByaWQgb2YgdGhpcy4gSXQncyBvbmx5IHVzZWQgZm9yIGNvbmZpZyBhbmQgaG9va3MuXG4gIHVwc2VydE9uZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygndXBzZXJ0T25lT2JqZWN0Jyk7XG4gICAgY29uc3QgY3JlYXRlVmFsdWUgPSBPYmplY3QuYXNzaWduKHt9LCBxdWVyeSwgdXBkYXRlKTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVPYmplY3QoY2xhc3NOYW1lLCBzY2hlbWEsIGNyZWF0ZVZhbHVlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgLy8gaWdub3JlIGR1cGxpY2F0ZSB2YWx1ZSBlcnJvcnMgYXMgaXQncyB1cHNlcnRcbiAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5maW5kT25lQW5kVXBkYXRlKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgdXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgfSk7XG4gIH1cblxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHsgc2tpcCwgbGltaXQsIHNvcnQsIGtleXMsIGNhc2VJbnNlbnNpdGl2ZSwgZXhwbGFpbiB9OiBRdWVyeU9wdGlvbnNcbiAgKSB7XG4gICAgZGVidWcoJ2ZpbmQnKTtcbiAgICBjb25zdCBoYXNMaW1pdCA9IGxpbWl0ICE9PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgaGFzU2tpcCA9IHNraXAgIT09IHVuZGVmaW5lZDtcbiAgICBsZXQgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDIsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcbiAgICBjb25zdCB3aGVyZVBhdHRlcm4gPSB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCBsaW1pdFBhdHRlcm4gPSBoYXNMaW1pdCA/IGBMSU1JVCAkJHt2YWx1ZXMubGVuZ3RoICsgMX1gIDogJyc7XG4gICAgaWYgKGhhc0xpbWl0KSB7XG4gICAgICB2YWx1ZXMucHVzaChsaW1pdCk7XG4gICAgfVxuICAgIGNvbnN0IHNraXBQYXR0ZXJuID0gaGFzU2tpcCA/IGBPRkZTRVQgJCR7dmFsdWVzLmxlbmd0aCArIDF9YCA6ICcnO1xuICAgIGlmIChoYXNTa2lwKSB7XG4gICAgICB2YWx1ZXMucHVzaChza2lwKTtcbiAgICB9XG5cbiAgICBsZXQgc29ydFBhdHRlcm4gPSAnJztcbiAgICBpZiAoc29ydCkge1xuICAgICAgY29uc3Qgc29ydENvcHk6IGFueSA9IHNvcnQ7XG4gICAgICBjb25zdCBzb3J0aW5nID0gT2JqZWN0LmtleXMoc29ydClcbiAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybUtleSA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGtleSkuam9pbignLT4nKTtcbiAgICAgICAgICAvLyBVc2luZyAkaWR4IHBhdHRlcm4gZ2l2ZXM6ICBub24taW50ZWdlciBjb25zdGFudCBpbiBPUkRFUiBCWVxuICAgICAgICAgIGlmIChzb3J0Q29weVtrZXldID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4gYCR7dHJhbnNmb3JtS2V5fSBBU0NgO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCR7dHJhbnNmb3JtS2V5fSBERVNDYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oKTtcbiAgICAgIHNvcnRQYXR0ZXJuID0gc29ydCAhPT0gdW5kZWZpbmVkICYmIE9iamVjdC5rZXlzKHNvcnQpLmxlbmd0aCA+IDAgPyBgT1JERVIgQlkgJHtzb3J0aW5nfWAgOiAnJztcbiAgICB9XG4gICAgaWYgKHdoZXJlLnNvcnRzICYmIE9iamVjdC5rZXlzKCh3aGVyZS5zb3J0czogYW55KSkubGVuZ3RoID4gMCkge1xuICAgICAgc29ydFBhdHRlcm4gPSBgT1JERVIgQlkgJHt3aGVyZS5zb3J0cy5qb2luKCl9YDtcbiAgICB9XG5cbiAgICBsZXQgY29sdW1ucyA9ICcqJztcbiAgICBpZiAoa2V5cykge1xuICAgICAgLy8gRXhjbHVkZSBlbXB0eSBrZXlzXG4gICAgICAvLyBSZXBsYWNlIEFDTCBieSBpdCdzIGtleXNcbiAgICAgIGtleXMgPSBrZXlzLnJlZHVjZSgobWVtbywga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09ICdBQ0wnKSB7XG4gICAgICAgICAgbWVtby5wdXNoKCdfcnBlcm0nKTtcbiAgICAgICAgICBtZW1vLnB1c2goJ193cGVybScpO1xuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIGtleS5sZW5ndGggPiAwICYmXG4gICAgICAgICAgLy8gUmVtb3ZlIHNlbGVjdGVkIGZpZWxkIG5vdCByZWZlcmVuY2VkIGluIHRoZSBzY2hlbWFcbiAgICAgICAgICAvLyBSZWxhdGlvbiBpcyBub3QgYSBjb2x1bW4gaW4gcG9zdGdyZXNcbiAgICAgICAgICAvLyAkc2NvcmUgaXMgYSBQYXJzZSBzcGVjaWFsIGZpZWxkIGFuZCBpcyBhbHNvIG5vdCBhIGNvbHVtblxuICAgICAgICAgICgoc2NoZW1hLmZpZWxkc1trZXldICYmIHNjaGVtYS5maWVsZHNba2V5XS50eXBlICE9PSAnUmVsYXRpb24nKSB8fCBrZXkgPT09ICckc2NvcmUnKVxuICAgICAgICApIHtcbiAgICAgICAgICBtZW1vLnB1c2goa2V5KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH0sIFtdKTtcbiAgICAgIGNvbHVtbnMgPSBrZXlzXG4gICAgICAgIC5tYXAoKGtleSwgaW5kZXgpID0+IHtcbiAgICAgICAgICBpZiAoa2V5ID09PSAnJHNjb3JlJykge1xuICAgICAgICAgICAgcmV0dXJuIGB0c19yYW5rX2NkKHRvX3RzdmVjdG9yKCQkezJ9LCAkJHszfTpuYW1lKSwgdG9fdHNxdWVyeSgkJHs0fSwgJCR7NX0pLCAzMikgYXMgc2NvcmVgO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYCQke2luZGV4ICsgdmFsdWVzLmxlbmd0aCArIDF9Om5hbWVgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgdmFsdWVzID0gdmFsdWVzLmNvbmNhdChrZXlzKTtcbiAgICB9XG5cbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gYFNFTEVDVCAke2NvbHVtbnN9IEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn0gJHtzb3J0UGF0dGVybn0gJHtsaW1pdFBhdHRlcm59ICR7c2tpcFBhdHRlcm59YDtcbiAgICBjb25zdCBxcyA9IGV4cGxhaW4gPyB0aGlzLmNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkob3JpZ2luYWxRdWVyeSkgOiBvcmlnaW5hbFF1ZXJ5O1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFF1ZXJ5IG9uIG5vbiBleGlzdGluZyB0YWJsZSwgZG9uJ3QgY3Jhc2hcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKGV4cGxhaW4pIHtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0cy5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gQ29udmVydHMgZnJvbSBhIHBvc3RncmVzLWZvcm1hdCBvYmplY3QgdG8gYSBSRVNULWZvcm1hdCBvYmplY3QuXG4gIC8vIERvZXMgbm90IHN0cmlwIG91dCBhbnl0aGluZyBiYXNlZCBvbiBhIGxhY2sgb2YgYXV0aGVudGljYXRpb24uXG4gIHBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHNjaGVtYTogYW55KSB7XG4gICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcicgJiYgb2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdFtmaWVsZE5hbWVdLFxuICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdHZW9Qb2ludCcsXG4gICAgICAgICAgbGF0aXR1ZGU6IG9iamVjdFtmaWVsZE5hbWVdLnksXG4gICAgICAgICAgbG9uZ2l0dWRlOiBvYmplY3RbZmllbGROYW1lXS54LFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgbGV0IGNvb3JkcyA9IG5ldyBTdHJpbmcob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICBjb29yZHMgPSBjb29yZHMuc3Vic3RyaW5nKDIsIGNvb3Jkcy5sZW5ndGggLSAyKS5zcGxpdCgnKSwoJyk7XG4gICAgICAgIGNvbnN0IHVwZGF0ZWRDb29yZHMgPSBjb29yZHMubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICByZXR1cm4gW3BhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVsxXSksIHBhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVswXSldO1xuICAgICAgICB9KTtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUG9seWdvbicsXG4gICAgICAgICAgY29vcmRpbmF0ZXM6IHVwZGF0ZWRDb29yZHMsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdGaWxlJykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdGaWxlJyxcbiAgICAgICAgICBuYW1lOiBvYmplY3RbZmllbGROYW1lXSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICAvL1RPRE86IHJlbW92ZSB0aGlzIHJlbGlhbmNlIG9uIHRoZSBtb25nbyBmb3JtYXQuIERCIGFkYXB0ZXIgc2hvdWxkbid0IGtub3cgdGhlcmUgaXMgYSBkaWZmZXJlbmNlIGJldHdlZW4gY3JlYXRlZCBhdCBhbmQgYW55IG90aGVyIGRhdGUgZmllbGQuXG4gICAgaWYgKG9iamVjdC5jcmVhdGVkQXQpIHtcbiAgICAgIG9iamVjdC5jcmVhdGVkQXQgPSBvYmplY3QuY3JlYXRlZEF0LnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmIChvYmplY3QudXBkYXRlZEF0KSB7XG4gICAgICBvYmplY3QudXBkYXRlZEF0ID0gb2JqZWN0LnVwZGF0ZWRBdC50b0lTT1N0cmluZygpO1xuICAgIH1cbiAgICBpZiAob2JqZWN0LmV4cGlyZXNBdCkge1xuICAgICAgb2JqZWN0LmV4cGlyZXNBdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0LmV4cGlyZXNBdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQpIHtcbiAgICAgIG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdCkge1xuICAgICAgb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IG51bGwpIHtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgICBpc286IG9iamVjdFtmaWVsZE5hbWVdLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIHVuaXF1ZSBpbmRleC4gVW5pcXVlIGluZGV4ZXMgb24gbnVsbGFibGUgZmllbGRzIGFyZSBub3QgYWxsb3dlZC4gU2luY2Ugd2UgZG9uJ3RcbiAgLy8gY3VycmVudGx5IGtub3cgd2hpY2ggZmllbGRzIGFyZSBudWxsYWJsZSBhbmQgd2hpY2ggYXJlbid0LCB3ZSBpZ25vcmUgdGhhdCBjcml0ZXJpYS5cbiAgLy8gQXMgc3VjaCwgd2Ugc2hvdWxkbid0IGV4cG9zZSB0aGlzIGZ1bmN0aW9uIHRvIHVzZXJzIG9mIHBhcnNlIHVudGlsIHdlIGhhdmUgYW4gb3V0LW9mLWJhbmRcbiAgLy8gV2F5IG9mIGRldGVybWluaW5nIGlmIGEgZmllbGQgaXMgbnVsbGFibGUuIFVuZGVmaW5lZCBkb2Vzbid0IGNvdW50IGFnYWluc3QgdW5pcXVlbmVzcyxcbiAgLy8gd2hpY2ggaXMgd2h5IHdlIHVzZSBzcGFyc2UgaW5kZXhlcy5cbiAgYXN5bmMgZW5zdXJlVW5pcXVlbmVzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IGNvbnN0cmFpbnROYW1lID0gYCR7Y2xhc3NOYW1lfV91bmlxdWVfJHtmaWVsZE5hbWVzLnNvcnQoKS5qb2luKCdfJyl9YDtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBVTklRVUUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMjpuYW1lIE9OICQxOm5hbWUoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZShxcywgW2NsYXNzTmFtZSwgY29uc3RyYWludE5hbWUsIC4uLmZpZWxkTmFtZXNdKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoY29uc3RyYWludE5hbWUpKSB7XG4gICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBjb3VudC5cbiAgYXN5bmMgY291bnQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgcmVhZFByZWZlcmVuY2U/OiBzdHJpbmcsXG4gICAgZXN0aW1hdGU/OiBib29sZWFuID0gdHJ1ZVxuICApIHtcbiAgICBkZWJ1ZygnY291bnQnKTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogMixcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGxldCBxcyA9ICcnO1xuXG4gICAgaWYgKHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCB8fCAhZXN0aW1hdGUpIHtcbiAgICAgIHFzID0gYFNFTEVDVCBjb3VudCgqKSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59YDtcbiAgICB9IGVsc2Uge1xuICAgICAgcXMgPSAnU0VMRUNUIHJlbHR1cGxlcyBBUyBhcHByb3hpbWF0ZV9yb3dfY291bnQgRlJPTSBwZ19jbGFzcyBXSEVSRSByZWxuYW1lID0gJDEnO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5vbmUocXMsIHZhbHVlcywgYSA9PiB7XG4gICAgICAgIGlmIChhLmFwcHJveGltYXRlX3Jvd19jb3VudCA9PSBudWxsIHx8IGEuYXBwcm94aW1hdGVfcm93X2NvdW50ID09IC0xKSB7XG4gICAgICAgICAgcmV0dXJuICFpc05hTigrYS5jb3VudCkgPyArYS5jb3VudCA6IDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICthLmFwcHJveGltYXRlX3Jvd19jb3VudDtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZGlzdGluY3QoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgcXVlcnk6IFF1ZXJ5VHlwZSwgZmllbGROYW1lOiBzdHJpbmcpIHtcbiAgICBkZWJ1ZygnZGlzdGluY3QnKTtcbiAgICBsZXQgZmllbGQgPSBmaWVsZE5hbWU7XG4gICAgbGV0IGNvbHVtbiA9IGZpZWxkTmFtZTtcbiAgICBjb25zdCBpc05lc3RlZCA9IGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIGZpZWxkID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgY29sdW1uID0gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG4gICAgfVxuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5JztcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtmaWVsZCwgY29sdW1uLCBjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiA0LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgdHJhbnNmb3JtZXIgPSBpc0FycmF5RmllbGQgPyAnanNvbmJfYXJyYXlfZWxlbWVudHMnIDogJ09OJztcbiAgICBsZXQgcXMgPSBgU0VMRUNUIERJU1RJTkNUICR7dHJhbnNmb3JtZXJ9KCQxOm5hbWUpICQyOm5hbWUgRlJPTSAkMzpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgaWYgKGlzTmVzdGVkKSB7XG4gICAgICBxcyA9IGBTRUxFQ1QgRElTVElOQ1QgJHt0cmFuc2Zvcm1lcn0oJDE6cmF3KSAkMjpyYXcgRlJPTSAkMzpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSBQb3N0Z3Jlc01pc3NpbmdDb2x1bW5FcnJvcikge1xuICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKCFpc05lc3RlZCkge1xuICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcihvYmplY3QgPT4gb2JqZWN0W2ZpZWxkXSAhPT0gbnVsbCk7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICBpZiAoIWlzUG9pbnRlckZpZWxkKSB7XG4gICAgICAgICAgICAgIHJldHVybiBvYmplY3RbZmllbGRdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBvYmplY3RJZDogb2JqZWN0W2ZpZWxkXSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY2hpbGQgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKVsxXTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiBvYmplY3RbY29sdW1uXVtjaGlsZF0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT5cbiAgICAgICAgcmVzdWx0cy5tYXAob2JqZWN0ID0+IHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKVxuICAgICAgKTtcbiAgfVxuXG4gIGFzeW5jIGFnZ3JlZ2F0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IGFueSxcbiAgICBwaXBlbGluZTogYW55LFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBleHBsYWluPzogYm9vbGVhblxuICApIHtcbiAgICBkZWJ1ZygnYWdncmVnYXRlJyk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgbGV0IGluZGV4OiBudW1iZXIgPSAyO1xuICAgIGxldCBjb2x1bW5zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBjb3VudEZpZWxkID0gbnVsbDtcbiAgICBsZXQgZ3JvdXBWYWx1ZXMgPSBudWxsO1xuICAgIGxldCB3aGVyZVBhdHRlcm4gPSAnJztcbiAgICBsZXQgbGltaXRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNraXBQYXR0ZXJuID0gJyc7XG4gICAgbGV0IHNvcnRQYXR0ZXJuID0gJyc7XG4gICAgbGV0IGdyb3VwUGF0dGVybiA9ICcnO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGlwZWxpbmUubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHN0YWdlID0gcGlwZWxpbmVbaV07XG4gICAgICBpZiAoc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kZ3JvdXBbZmllbGRdO1xuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJyAmJiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIHZhbHVlICE9PSAnJykge1xuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZSBBUyBcIm9iamVjdElkXCJgKTtcbiAgICAgICAgICAgIGdyb3VwUGF0dGVybiA9IGBHUk9VUCBCWSAkJHtpbmRleH06bmFtZWA7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZmllbGQgPT09ICdfaWQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgICAgZ3JvdXBWYWx1ZXMgPSB2YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwQnlGaWVsZHMgPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgYWxpYXMgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZVthbGlhc10gPT09ICdzdHJpbmcnICYmIHZhbHVlW2FsaWFzXSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkKHZhbHVlW2FsaWFzXSk7XG4gICAgICAgICAgICAgICAgaWYgKCFncm91cEJ5RmllbGRzLmluY2x1ZGVzKGBcIiR7c291cmNlfVwiYCkpIHtcbiAgICAgICAgICAgICAgICAgIGdyb3VwQnlGaWVsZHMucHVzaChgXCIke3NvdXJjZX1cImApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChzb3VyY2UsIGFsaWFzKTtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb3BlcmF0aW9uID0gT2JqZWN0LmtleXModmFsdWVbYWxpYXNdKVswXTtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZVthbGlhc11bb3BlcmF0aW9uXSk7XG4gICAgICAgICAgICAgICAgaWYgKG1vbmdvQWdncmVnYXRlVG9Qb3N0Z3Jlc1tvcGVyYXRpb25dKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWdyb3VwQnlGaWVsZHMuaW5jbHVkZXMoYFwiJHtzb3VyY2V9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgICBncm91cEJ5RmllbGRzLnB1c2goYFwiJHtzb3VyY2V9XCJgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChcbiAgICAgICAgICAgICAgICAgICAgYEVYVFJBQ1QoJHtcbiAgICAgICAgICAgICAgICAgICAgICBtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXNbb3BlcmF0aW9uXVxuICAgICAgICAgICAgICAgICAgICB9IEZST00gJCR7aW5kZXh9Om5hbWUgQVQgVElNRSBaT05FICdVVEMnKTo6aW50ZWdlciBBUyAkJHtpbmRleCArIDF9Om5hbWVgXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goc291cmNlLCBhbGlhcyk7XG4gICAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ3JvdXBQYXR0ZXJuID0gYEdST1VQIEJZICQke2luZGV4fTpyYXdgO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZ3JvdXBCeUZpZWxkcy5qb2luKCkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgaWYgKHZhbHVlLiRzdW0pIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZS4kc3VtID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgU1VNKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kc3VtKSwgZmllbGQpO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY291bnRGaWVsZCA9IGZpZWxkO1xuICAgICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgQ09VTlQoKikgQVMgJCR7aW5kZXh9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCk7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRtYXgpIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBNQVgoJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kbWF4KSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRtaW4pIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBNSU4oJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kbWluKSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbHVlLiRhdmcpIHtcbiAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGBBVkcoJCR7aW5kZXh9Om5hbWUpIEFTICQke2luZGV4ICsgMX06bmFtZWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaCh0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZS4kYXZnKSwgZmllbGQpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29sdW1ucy5wdXNoKCcqJyk7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgaWYgKGNvbHVtbnMuaW5jbHVkZXMoJyonKSkge1xuICAgICAgICAgIGNvbHVtbnMgPSBbXTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kcHJvamVjdFtmaWVsZF07XG4gICAgICAgICAgaWYgKHZhbHVlID09PSAxIHx8IHZhbHVlID09PSB0cnVlKSB7XG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goYCQke2luZGV4fTpuYW1lYCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCk7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRtYXRjaCkge1xuICAgICAgICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICAgICAgICBjb25zdCBvck9yQW5kID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0YWdlLiRtYXRjaCwgJyRvcicpXG4gICAgICAgICAgPyAnIE9SICdcbiAgICAgICAgICA6ICcgQU5EICc7XG5cbiAgICAgICAgaWYgKHN0YWdlLiRtYXRjaC4kb3IpIHtcbiAgICAgICAgICBjb25zdCBjb2xsYXBzZSA9IHt9O1xuICAgICAgICAgIHN0YWdlLiRtYXRjaC4kb3IuZm9yRWFjaChlbGVtZW50ID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgY29sbGFwc2Vba2V5XSA9IGVsZW1lbnRba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBzdGFnZS4kbWF0Y2ggPSBjb2xsYXBzZTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBmaWVsZCBpbiBzdGFnZS4kbWF0Y2gpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRtYXRjaFtmaWVsZF07XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJykge1xuICAgICAgICAgICAgZmllbGQgPSAnb2JqZWN0SWQnO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBtYXRjaFBhdHRlcm5zID0gW107XG4gICAgICAgICAgT2JqZWN0LmtleXMoUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yKS5mb3JFYWNoKGNtcCA9PiB7XG4gICAgICAgICAgICBpZiAodmFsdWVbY21wXSkge1xuICAgICAgICAgICAgICBjb25zdCBwZ0NvbXBhcmF0b3IgPSBQYXJzZVRvUG9zZ3Jlc0NvbXBhcmF0b3JbY21wXTtcbiAgICAgICAgICAgICAgbWF0Y2hQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAke3BnQ29tcGFyYXRvcn0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlW2NtcF0pKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAobWF0Y2hQYXR0ZXJucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJHttYXRjaFBhdHRlcm5zLmpvaW4oJyBBTkQgJyl9KWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSAmJiBtYXRjaFBhdHRlcm5zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdmFsdWUpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgd2hlcmVQYXR0ZXJuID0gcGF0dGVybnMubGVuZ3RoID4gMCA/IGBXSEVSRSAke3BhdHRlcm5zLmpvaW4oYCAke29yT3JBbmR9IGApfWAgOiAnJztcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbGltaXQpIHtcbiAgICAgICAgbGltaXRQYXR0ZXJuID0gYExJTUlUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRsaW1pdCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHNraXApIHtcbiAgICAgICAgc2tpcFBhdHRlcm4gPSBgT0ZGU0VUICQke2luZGV4fWA7XG4gICAgICAgIHZhbHVlcy5wdXNoKHN0YWdlLiRza2lwKTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc29ydCkge1xuICAgICAgICBjb25zdCBzb3J0ID0gc3RhZ2UuJHNvcnQ7XG4gICAgICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhzb3J0KTtcbiAgICAgICAgY29uc3Qgc29ydGluZyA9IGtleXNcbiAgICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1lciA9IHNvcnRba2V5XSA9PT0gMSA/ICdBU0MnIDogJ0RFU0MnO1xuICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSBgJCR7aW5kZXh9Om5hbWUgJHt0cmFuc2Zvcm1lcn1gO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIHJldHVybiBvcmRlcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5qb2luKCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKC4uLmtleXMpO1xuICAgICAgICBzb3J0UGF0dGVybiA9IHNvcnQgIT09IHVuZGVmaW5lZCAmJiBzb3J0aW5nLmxlbmd0aCA+IDAgPyBgT1JERVIgQlkgJHtzb3J0aW5nfWAgOiAnJztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZ3JvdXBQYXR0ZXJuKSB7XG4gICAgICBjb2x1bW5zLmZvckVhY2goKGUsIGksIGEpID0+IHtcbiAgICAgICAgaWYgKGUgJiYgZS50cmltKCkgPT09ICcqJykge1xuICAgICAgICAgIGFbaV0gPSAnJztcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IGBTRUxFQ1QgJHtjb2x1bW5zXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuam9pbigpfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c2tpcFBhdHRlcm59ICR7Z3JvdXBQYXR0ZXJufSAke3NvcnRQYXR0ZXJufSAke2xpbWl0UGF0dGVybn1gO1xuICAgIGNvbnN0IHFzID0gZXhwbGFpbiA/IHRoaXMuY3JlYXRlRXhwbGFpbmFibGVRdWVyeShvcmlnaW5hbFF1ZXJ5KSA6IG9yaWdpbmFsUXVlcnk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHZhbHVlcykudGhlbihhID0+IHtcbiAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgIHJldHVybiBhO1xuICAgICAgfVxuICAgICAgY29uc3QgcmVzdWx0cyA9IGEubWFwKG9iamVjdCA9PiB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSk7XG4gICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdWx0LCAnb2JqZWN0SWQnKSkge1xuICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGdyb3VwVmFsdWVzKSB7XG4gICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0ge307XG4gICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5vYmplY3RJZFtrZXldID0gcmVzdWx0W2tleV07XG4gICAgICAgICAgICBkZWxldGUgcmVzdWx0W2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjb3VudEZpZWxkKSB7XG4gICAgICAgICAgcmVzdWx0W2NvdW50RmllbGRdID0gcGFyc2VJbnQocmVzdWx0W2NvdW50RmllbGRdLCAxMCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBwZXJmb3JtSW5pdGlhbGl6YXRpb24oeyBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIH06IGFueSkge1xuICAgIC8vIFRPRE86IFRoaXMgbWV0aG9kIG5lZWRzIHRvIGJlIHJld3JpdHRlbiB0byBtYWtlIHByb3BlciB1c2Ugb2YgY29ubmVjdGlvbnMgKEB2aXRhbHktdClcbiAgICBkZWJ1ZygncGVyZm9ybUluaXRpYWxpemF0aW9uJyk7XG4gICAgYXdhaXQgdGhpcy5fZW5zdXJlU2NoZW1hQ29sbGVjdGlvbkV4aXN0cygpO1xuICAgIGNvbnN0IHByb21pc2VzID0gVm9sYXRpbGVDbGFzc2VzU2NoZW1hcy5tYXAoc2NoZW1hID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVRhYmxlKHNjaGVtYS5jbGFzc05hbWUsIHNjaGVtYSlcbiAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgZXJyLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciB8fFxuICAgICAgICAgICAgZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHRoaXMuc2NoZW1hVXBncmFkZShzY2hlbWEuY2xhc3NOYW1lLCBzY2hlbWEpKTtcbiAgICB9KTtcbiAgICBwcm9taXNlcy5wdXNoKHRoaXMuX2xpc3RlblRvU2NoZW1hKCkpO1xuICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsaWVudC50eCgncGVyZm9ybS1pbml0aWFsaXphdGlvbicsIGFzeW5jIHQgPT4ge1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwubWlzYy5qc29uT2JqZWN0U2V0S2V5cyk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5hZGQpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuYWRkVW5pcXVlKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LnJlbW92ZSk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbFJlZ2V4KTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmNvbnRhaW5zKTtcbiAgICAgICAgICByZXR1cm4gdC5jdHg7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKGN0eCA9PiB7XG4gICAgICAgIGRlYnVnKGBpbml0aWFsaXphdGlvbkRvbmUgaW4gJHtjdHguZHVyYXRpb259YCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55LCBjb25uOiA/YW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PlxuICAgICAgdC5iYXRjaChcbiAgICAgICAgaW5kZXhlcy5tYXAoaSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHQubm9uZSgnQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgkMzpuYW1lKScsIFtcbiAgICAgICAgICAgIGkubmFtZSxcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGkua2V5LFxuICAgICAgICAgIF0pO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzSWZOZWVkZWQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogYW55LFxuICAgIGNvbm46ID9hbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgKGNvbm4gfHwgdGhpcy5fY2xpZW50KS5ub25lKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgZmllbGROYW1lLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHlwZSxcbiAgICBdKTtcbiAgfVxuXG4gIGFzeW5jIGRyb3BJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnksIGNvbm46IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHF1ZXJpZXMgPSBpbmRleGVzLm1hcChpID0+ICh7XG4gICAgICBxdWVyeTogJ0RST1AgSU5ERVggJDE6bmFtZScsXG4gICAgICB2YWx1ZXM6IGksXG4gICAgfSkpO1xuICAgIGF3YWl0IChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PiB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKSk7XG4gIH1cblxuICBhc3luYyBnZXRJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcXMgPSAnU0VMRUNUICogRlJPTSBwZ19pbmRleGVzIFdIRVJFIHRhYmxlbmFtZSA9ICR7Y2xhc3NOYW1lfSc7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHsgY2xhc3NOYW1lIH0pO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gVXNlZCBmb3IgdGVzdGluZyBwdXJwb3Nlc1xuICBhc3luYyB1cGRhdGVFc3RpbWF0ZWRDb3VudChjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZSgnQU5BTFlaRSAkMTpuYW1lJywgW2NsYXNzTmFtZV0pO1xuICB9XG5cbiAgYXN5bmMgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICBjb25zdCB0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHt9O1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0ID0gdGhpcy5fY2xpZW50LnR4KHQgPT4ge1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50ID0gdDtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc29sdmUgPSByZXNvbHZlO1xuICAgICAgICB9KTtcbiAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2ggPSBbXTtcbiAgICAgICAgcmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKSk7XG4gICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdDtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlc3Npb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uLnJlc3VsdC5jYXRjaCgpO1xuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2goUHJvbWlzZS5yZWplY3QoKSk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2Vzc2lvbi50LmJhdGNoKHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoKSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZUluZGV4KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXSxcbiAgICBpbmRleE5hbWU6ID9zdHJpbmcsXG4gICAgY2FzZUluc2Vuc2l0aXZlOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9ucz86IE9iamVjdCA9IHt9XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgY29ubiA9IG9wdGlvbnMuY29ubiAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5jb25uIDogdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IGRlZmF1bHRJbmRleE5hbWUgPSBgcGFyc2VfZGVmYXVsdF8ke2ZpZWxkTmFtZXMuc29ydCgpLmpvaW4oJ18nKX1gO1xuICAgIGNvbnN0IGluZGV4TmFtZU9wdGlvbnM6IE9iamVjdCA9XG4gICAgICBpbmRleE5hbWUgIT0gbnVsbCA/IHsgbmFtZTogaW5kZXhOYW1lIH0gOiB7IG5hbWU6IGRlZmF1bHRJbmRleE5hbWUgfTtcbiAgICBjb25zdCBjb25zdHJhaW50UGF0dGVybnMgPSBjYXNlSW5zZW5zaXRpdmVcbiAgICAgID8gZmllbGROYW1lcy5tYXAoKGZpZWxkTmFtZSwgaW5kZXgpID0+IGBsb3dlcigkJHtpbmRleCArIDN9Om5hbWUpIHZhcmNoYXJfcGF0dGVybl9vcHNgKVxuICAgICAgOiBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWApO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJHtjb25zdHJhaW50UGF0dGVybnMuam9pbigpfSlgO1xuICAgIGNvbnN0IHNldElkZW1wb3RlbmN5RnVuY3Rpb24gPVxuICAgICAgb3B0aW9ucy5zZXRJZGVtcG90ZW5jeUZ1bmN0aW9uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gOiBmYWxzZTtcbiAgICBpZiAoc2V0SWRlbXBvdGVuY3lGdW5jdGlvbikge1xuICAgICAgYXdhaXQgdGhpcy5lbnN1cmVJZGVtcG90ZW5jeUZ1bmN0aW9uRXhpc3RzKG9wdGlvbnMpO1xuICAgIH1cbiAgICBhd2FpdCBjb25uLm5vbmUocXMsIFtpbmRleE5hbWVPcHRpb25zLm5hbWUsIGNsYXNzTmFtZSwgLi4uZmllbGROYW1lc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGlmIChcbiAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yICYmXG4gICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoaW5kZXhOYW1lT3B0aW9ucy5uYW1lKVxuICAgICAgKSB7XG4gICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhpbmRleE5hbWVPcHRpb25zLm5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gQ2FzdCB0aGUgZXJyb3IgaW50byB0aGUgcHJvcGVyIHBhcnNlIGVycm9yXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZUlkZW1wb3RlbmN5RnVuY3Rpb24ob3B0aW9ucz86IE9iamVjdCA9IHt9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgcXMgPSAnRFJPUCBGVU5DVElPTiBJRiBFWElTVFMgaWRlbXBvdGVuY3lfZGVsZXRlX2V4cGlyZWRfcmVjb3JkcygpJztcbiAgICByZXR1cm4gY29ubi5ub25lKHFzKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMob3B0aW9ucz86IE9iamVjdCA9IHt9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgdHRsT3B0aW9ucyA9IG9wdGlvbnMudHRsICE9PSB1bmRlZmluZWQgPyBgJHtvcHRpb25zLnR0bH0gc2Vjb25kc2AgOiAnNjAgc2Vjb25kcyc7XG4gICAgY29uc3QgcXMgPVxuICAgICAgJ0NSRUFURSBPUiBSRVBMQUNFIEZVTkNUSU9OIGlkZW1wb3RlbmN5X2RlbGV0ZV9leHBpcmVkX3JlY29yZHMoKSBSRVRVUk5TIHZvaWQgTEFOR1VBR0UgcGxwZ3NxbCBBUyAkJCBCRUdJTiBERUxFVEUgRlJPTSBcIl9JZGVtcG90ZW5jeVwiIFdIRVJFIGV4cGlyZSA8IE5PVygpIC0gSU5URVJWQUwgJDE7IEVORDsgJCQ7JztcbiAgICByZXR1cm4gY29ubi5ub25lKHFzLCBbdHRsT3B0aW9uc10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRQb2x5Z29uVG9TUUwocG9seWdvbikge1xuICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYFBvbHlnb24gbXVzdCBoYXZlIGF0IGxlYXN0IDMgdmFsdWVzYCk7XG4gIH1cbiAgaWYgKFxuICAgIHBvbHlnb25bMF1bMF0gIT09IHBvbHlnb25bcG9seWdvbi5sZW5ndGggLSAxXVswXSB8fFxuICAgIHBvbHlnb25bMF1bMV0gIT09IHBvbHlnb25bcG9seWdvbi5sZW5ndGggLSAxXVsxXVxuICApIHtcbiAgICBwb2x5Z29uLnB1c2gocG9seWdvblswXSk7XG4gIH1cbiAgY29uc3QgdW5pcXVlID0gcG9seWdvbi5maWx0ZXIoKGl0ZW0sIGluZGV4LCBhcikgPT4ge1xuICAgIGxldCBmb3VuZEluZGV4ID0gLTE7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3QgcHQgPSBhcltpXTtcbiAgICAgIGlmIChwdFswXSA9PT0gaXRlbVswXSAmJiBwdFsxXSA9PT0gaXRlbVsxXSkge1xuICAgICAgICBmb3VuZEluZGV4ID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmb3VuZEluZGV4ID09PSBpbmRleDtcbiAgfSk7XG4gIGlmICh1bmlxdWUubGVuZ3RoIDwgMykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICdHZW9KU09OOiBMb29wIG11c3QgaGF2ZSBhdCBsZWFzdCAzIGRpZmZlcmVudCB2ZXJ0aWNlcydcbiAgICApO1xuICB9XG4gIGNvbnN0IHBvaW50cyA9IHBvbHlnb25cbiAgICAubWFwKHBvaW50ID0+IHtcbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwYXJzZUZsb2F0KHBvaW50WzFdKSwgcGFyc2VGbG9hdChwb2ludFswXSkpO1xuICAgICAgcmV0dXJuIGAoJHtwb2ludFsxXX0sICR7cG9pbnRbMF19KWA7XG4gICAgfSlcbiAgICAuam9pbignLCAnKTtcbiAgcmV0dXJuIGAoJHtwb2ludHN9KWA7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpIHtcbiAgaWYgKCFyZWdleC5lbmRzV2l0aCgnXFxuJykpIHtcbiAgICByZWdleCArPSAnXFxuJztcbiAgfVxuXG4gIC8vIHJlbW92ZSBub24gZXNjYXBlZCBjb21tZW50c1xuICByZXR1cm4gKFxuICAgIHJlZ2V4XG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pIy4qXFxuL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSBsaW5lcyBzdGFydGluZyB3aXRoIGEgY29tbWVudFxuICAgICAgLnJlcGxhY2UoL14jLipcXG4vZ2ltLCAnJylcbiAgICAgIC8vIHJlbW92ZSBub24gZXNjYXBlZCB3aGl0ZXNwYWNlXG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pXFxzKy9naW0sICckMScpXG4gICAgICAvLyByZW1vdmUgd2hpdGVzcGFjZSBhdCB0aGUgYmVnaW5uaW5nIG9mIGEgbGluZVxuICAgICAgLnJlcGxhY2UoL15cXHMrLywgJycpXG4gICAgICAudHJpbSgpXG4gICk7XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NSZWdleFBhdHRlcm4ocykge1xuICBpZiAocyAmJiBzLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIC8vIHJlZ2V4IGZvciBzdGFydHNXaXRoXG4gICAgcmV0dXJuICdeJyArIGxpdGVyYWxpemVSZWdleFBhcnQocy5zbGljZSgxKSk7XG4gIH0gZWxzZSBpZiAocyAmJiBzLmVuZHNXaXRoKCckJykpIHtcbiAgICAvLyByZWdleCBmb3IgZW5kc1dpdGhcbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDAsIHMubGVuZ3RoIC0gMSkpICsgJyQnO1xuICB9XG5cbiAgLy8gcmVnZXggZm9yIGNvbnRhaW5zXG4gIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMpO1xufVxuXG5mdW5jdGlvbiBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZSkge1xuICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgfHwgIXZhbHVlLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXFxeXFxcXFEuKlxcXFxFLyk7XG4gIHJldHVybiAhIW1hdGNoZXM7XG59XG5cbmZ1bmN0aW9uIGlzQWxsVmFsdWVzUmVnZXhPck5vbmUodmFsdWVzKSB7XG4gIGlmICghdmFsdWVzIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlcykgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgY29uc3QgZmlyc3RWYWx1ZXNJc1JlZ2V4ID0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzWzBdLiRyZWdleCk7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGZpcnN0VmFsdWVzSXNSZWdleDtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAxLCBsZW5ndGggPSB2YWx1ZXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoZmlyc3RWYWx1ZXNJc1JlZ2V4ICE9PSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbaV0uJHJlZ2V4KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKHZhbHVlcykge1xuICByZXR1cm4gdmFsdWVzLnNvbWUoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlLiRyZWdleCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKSB7XG4gIHJldHVybiByZW1haW5pbmdcbiAgICAuc3BsaXQoJycpXG4gICAgLm1hcChjID0+IHtcbiAgICAgIGNvbnN0IHJlZ2V4ID0gUmVnRXhwKCdbMC05IF18XFxcXHB7TH0nLCAndScpOyAvLyBTdXBwb3J0IGFsbCB1bmljb2RlIGxldHRlciBjaGFyc1xuICAgICAgaWYgKGMubWF0Y2gocmVnZXgpICE9PSBudWxsKSB7XG4gICAgICAgIC8vIGRvbid0IGVzY2FwZSBhbHBoYW51bWVyaWMgY2hhcmFjdGVyc1xuICAgICAgICByZXR1cm4gYztcbiAgICAgIH1cbiAgICAgIC8vIGVzY2FwZSBldmVyeXRoaW5nIGVsc2UgKHNpbmdsZSBxdW90ZXMgd2l0aCBzaW5nbGUgcXVvdGVzLCBldmVyeXRoaW5nIGVsc2Ugd2l0aCBhIGJhY2tzbGFzaClcbiAgICAgIHJldHVybiBjID09PSBgJ2AgPyBgJydgIDogYFxcXFwke2N9YDtcbiAgICB9KVxuICAgIC5qb2luKCcnKTtcbn1cblxuZnVuY3Rpb24gbGl0ZXJhbGl6ZVJlZ2V4UGFydChzOiBzdHJpbmcpIHtcbiAgY29uc3QgbWF0Y2hlcjEgPSAvXFxcXFEoKD8hXFxcXEUpLiopXFxcXEUkLztcbiAgY29uc3QgcmVzdWx0MTogYW55ID0gcy5tYXRjaChtYXRjaGVyMSk7XG4gIGlmIChyZXN1bHQxICYmIHJlc3VsdDEubGVuZ3RoID4gMSAmJiByZXN1bHQxLmluZGV4ID4gLTEpIHtcbiAgICAvLyBwcm9jZXNzIHJlZ2V4IHRoYXQgaGFzIGEgYmVnaW5uaW5nIGFuZCBhbiBlbmQgc3BlY2lmaWVkIGZvciB0aGUgbGl0ZXJhbCB0ZXh0XG4gICAgY29uc3QgcHJlZml4ID0gcy5zdWJzdHJpbmcoMCwgcmVzdWx0MS5pbmRleCk7XG4gICAgY29uc3QgcmVtYWluaW5nID0gcmVzdWx0MVsxXTtcblxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHByZWZpeCkgKyBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKTtcbiAgfVxuXG4gIC8vIHByb2Nlc3MgcmVnZXggdGhhdCBoYXMgYSBiZWdpbm5pbmcgc3BlY2lmaWVkIGZvciB0aGUgbGl0ZXJhbCB0ZXh0XG4gIGNvbnN0IG1hdGNoZXIyID0gL1xcXFxRKCg/IVxcXFxFKS4qKSQvO1xuICBjb25zdCByZXN1bHQyOiBhbnkgPSBzLm1hdGNoKG1hdGNoZXIyKTtcbiAgaWYgKHJlc3VsdDIgJiYgcmVzdWx0Mi5sZW5ndGggPiAxICYmIHJlc3VsdDIuaW5kZXggPiAtMSkge1xuICAgIGNvbnN0IHByZWZpeCA9IHMuc3Vic3RyaW5nKDAsIHJlc3VsdDIuaW5kZXgpO1xuICAgIGNvbnN0IHJlbWFpbmluZyA9IHJlc3VsdDJbMV07XG5cbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChwcmVmaXgpICsgY3JlYXRlTGl0ZXJhbFJlZ2V4KHJlbWFpbmluZyk7XG4gIH1cblxuICAvLyByZW1vdmUgYWxsIGluc3RhbmNlcyBvZiBcXFEgYW5kIFxcRSBmcm9tIHRoZSByZW1haW5pbmcgdGV4dCAmIGVzY2FwZSBzaW5nbGUgcXVvdGVzXG4gIHJldHVybiBzXG4gICAgLnJlcGxhY2UoLyhbXlxcXFxdKShcXFxcRSkvLCAnJDEnKVxuICAgIC5yZXBsYWNlKC8oW15cXFxcXSkoXFxcXFEpLywgJyQxJylcbiAgICAucmVwbGFjZSgvXlxcXFxFLywgJycpXG4gICAgLnJlcGxhY2UoL15cXFxcUS8sICcnKVxuICAgIC5yZXBsYWNlKC8oW14nXSknL2csIGAkMScnYClcbiAgICAucmVwbGFjZSgvXicoW14nXSkvLCBgJyckMWApO1xufVxuXG52YXIgR2VvUG9pbnRDb2RlciA9IHtcbiAgaXNWYWxpZEpTT04odmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiB2YWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCc7XG4gIH0sXG59O1xuXG5leHBvcnQgZGVmYXVsdCBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQSxJQUFBQSxlQUFBLEdBQUFDLE9BQUE7QUFFQSxJQUFBQyxLQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFFQSxJQUFBRyxPQUFBLEdBQUFELHNCQUFBLENBQUFGLE9BQUE7QUFFQSxJQUFBSSxLQUFBLEdBQUFKLE9BQUE7QUFDQSxJQUFBSyxJQUFBLEdBQUFILHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBTSxlQUFBLEdBQUFOLE9BQUE7QUFBbUQsU0FBQUUsdUJBQUFLLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFBQSxTQUFBRyxRQUFBQyxDQUFBLEVBQUFDLENBQUEsUUFBQUMsQ0FBQSxHQUFBQyxNQUFBLENBQUFDLElBQUEsQ0FBQUosQ0FBQSxPQUFBRyxNQUFBLENBQUFFLHFCQUFBLFFBQUFDLENBQUEsR0FBQUgsTUFBQSxDQUFBRSxxQkFBQSxDQUFBTCxDQUFBLEdBQUFDLENBQUEsS0FBQUssQ0FBQSxHQUFBQSxDQUFBLENBQUFDLE1BQUEsV0FBQU4sQ0FBQSxXQUFBRSxNQUFBLENBQUFLLHdCQUFBLENBQUFSLENBQUEsRUFBQUMs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