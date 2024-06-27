"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VolatileClassesSchemas = exports.SchemaController = void 0;
exports.buildMergedSchemaObject = buildMergedSchemaObject;
exports.classNameIsValid = classNameIsValid;
exports.defaultColumns = exports.default = exports.convertSchemaToAdapterSchema = void 0;
exports.fieldNameIsValid = fieldNameIsValid;
exports.invalidClassNameMessage = invalidClassNameMessage;
exports.systemClasses = exports.requiredColumns = exports.load = void 0;
var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");
var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));
var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));
var _Config = _interopRequireDefault(require("../Config"));
var _deepcopy = _interopRequireDefault(require("deepcopy"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _extends() { _extends = Object.assign ? Object.assign.bind() : function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }
// This class handles schema validation, persistence, and modification.
//
// Each individual Schema object should be immutable. The helpers to
// do things with the Schema just return a new schema when the schema
// is changed.
//
// The canonical place to store this Schema is in the database itself,
// in a _SCHEMA collection. This is not the right way to do it for an
// open source framework, but it's backward compatible, so we're
// keeping it this way for now.
//
// In API-handling code, you should only use the Schema class via the
// DatabaseController. This will let us replace the schema logic for
// different databases.
// TODO: hide all schema logic inside the database adapter.
// -disable-next
const Parse = require('parse/node').Parse;

// -disable-next

const defaultColumns = exports.defaultColumns = Object.freeze({
  // Contain the default columns for every parse object type (except _Join collection)
  _Default: {
    objectId: {
      type: 'String'
    },
    createdAt: {
      type: 'Date'
    },
    updatedAt: {
      type: 'Date'
    },
    ACL: {
      type: 'ACL'
    }
  },
  // The additional default columns for the _User collection (in addition to DefaultCols)
  _User: {
    username: {
      type: 'String'
    },
    password: {
      type: 'String'
    },
    email: {
      type: 'String'
    },
    emailVerified: {
      type: 'Boolean'
    },
    authData: {
      type: 'Object'
    }
  },
  // The additional default columns for the _Installation collection (in addition to DefaultCols)
  _Installation: {
    installationId: {
      type: 'String'
    },
    deviceToken: {
      type: 'String'
    },
    channels: {
      type: 'Array'
    },
    deviceType: {
      type: 'String'
    },
    pushType: {
      type: 'String'
    },
    GCMSenderId: {
      type: 'String'
    },
    timeZone: {
      type: 'String'
    },
    localeIdentifier: {
      type: 'String'
    },
    badge: {
      type: 'Number'
    },
    appVersion: {
      type: 'String'
    },
    appName: {
      type: 'String'
    },
    appIdentifier: {
      type: 'String'
    },
    parseVersion: {
      type: 'String'
    }
  },
  // The additional default columns for the _Role collection (in addition to DefaultCols)
  _Role: {
    name: {
      type: 'String'
    },
    users: {
      type: 'Relation',
      targetClass: '_User'
    },
    roles: {
      type: 'Relation',
      targetClass: '_Role'
    }
  },
  // The additional default columns for the _Session collection (in addition to DefaultCols)
  _Session: {
    user: {
      type: 'Pointer',
      targetClass: '_User'
    },
    installationId: {
      type: 'String'
    },
    sessionToken: {
      type: 'String'
    },
    expiresAt: {
      type: 'Date'
    },
    createdWith: {
      type: 'Object'
    }
  },
  _Product: {
    productIdentifier: {
      type: 'String'
    },
    download: {
      type: 'File'
    },
    downloadName: {
      type: 'String'
    },
    icon: {
      type: 'File'
    },
    order: {
      type: 'Number'
    },
    title: {
      type: 'String'
    },
    subtitle: {
      type: 'String'
    }
  },
  _PushStatus: {
    pushTime: {
      type: 'String'
    },
    source: {
      type: 'String'
    },
    // rest or webui
    query: {
      type: 'String'
    },
    // the stringified JSON query
    payload: {
      type: 'String'
    },
    // the stringified JSON payload,
    title: {
      type: 'String'
    },
    expiry: {
      type: 'Number'
    },
    expiration_interval: {
      type: 'Number'
    },
    status: {
      type: 'String'
    },
    numSent: {
      type: 'Number'
    },
    numFailed: {
      type: 'Number'
    },
    pushHash: {
      type: 'String'
    },
    errorMessage: {
      type: 'Object'
    },
    sentPerType: {
      type: 'Object'
    },
    failedPerType: {
      type: 'Object'
    },
    sentPerUTCOffset: {
      type: 'Object'
    },
    failedPerUTCOffset: {
      type: 'Object'
    },
    count: {
      type: 'Number'
    } // tracks # of batches queued and pending
  },
  _JobStatus: {
    jobName: {
      type: 'String'
    },
    source: {
      type: 'String'
    },
    status: {
      type: 'String'
    },
    message: {
      type: 'String'
    },
    params: {
      type: 'Object'
    },
    // params received when calling the job
    finishedAt: {
      type: 'Date'
    }
  },
  _JobSchedule: {
    jobName: {
      type: 'String'
    },
    description: {
      type: 'String'
    },
    params: {
      type: 'String'
    },
    startAfter: {
      type: 'String'
    },
    daysOfWeek: {
      type: 'Array'
    },
    timeOfDay: {
      type: 'String'
    },
    lastRun: {
      type: 'Number'
    },
    repeatMinutes: {
      type: 'Number'
    }
  },
  _Hooks: {
    functionName: {
      type: 'String'
    },
    className: {
      type: 'String'
    },
    triggerName: {
      type: 'String'
    },
    url: {
      type: 'String'
    }
  },
  _GlobalConfig: {
    objectId: {
      type: 'String'
    },
    params: {
      type: 'Object'
    },
    masterKeyOnly: {
      type: 'Object'
    }
  },
  _GraphQLConfig: {
    objectId: {
      type: 'String'
    },
    config: {
      type: 'Object'
    }
  },
  _Audience: {
    objectId: {
      type: 'String'
    },
    name: {
      type: 'String'
    },
    query: {
      type: 'String'
    },
    //storing query as JSON string to prevent "Nested keys should not contain the '$' or '.' characters" error
    lastUsed: {
      type: 'Date'
    },
    timesUsed: {
      type: 'Number'
    }
  },
  _Idempotency: {
    reqId: {
      type: 'String'
    },
    expire: {
      type: 'Date'
    }
  }
});

// fields required for read or write operations on their respective classes.
const requiredColumns = exports.requiredColumns = Object.freeze({
  read: {
    _User: ['username']
  },
  write: {
    _Product: ['productIdentifier', 'icon', 'order', 'title', 'subtitle'],
    _Role: ['name', 'ACL']
  }
});
const invalidColumns = ['length'];
const systemClasses = exports.systemClasses = Object.freeze(['_User', '_Installation', '_Role', '_Session', '_Product', '_PushStatus', '_JobStatus', '_JobSchedule', '_Audience', '_Idempotency']);
const volatileClasses = Object.freeze(['_JobStatus', '_PushStatus', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_JobSchedule', '_Audience', '_Idempotency']);

// Anything that start with role
const roleRegex = /^role:.*/;
// Anything that starts with userField (allowed for protected fields only)
const protectedFieldsPointerRegex = /^userField:.*/;
// * permission
const publicRegex = /^\*$/;
const authenticatedRegex = /^authenticated$/;
const requiresAuthenticationRegex = /^requiresAuthentication$/;
const clpPointerRegex = /^pointerFields$/;

// regex for validating entities in protectedFields object
const protectedFieldsRegex = Object.freeze([protectedFieldsPointerRegex, publicRegex, authenticatedRegex, roleRegex]);

// clp regex
const clpFieldsRegex = Object.freeze([clpPointerRegex, publicRegex, requiresAuthenticationRegex, roleRegex]);
function validatePermissionKey(key, userIdRegExp) {
  let matchesSome = false;
  for (const regEx of clpFieldsRegex) {
    if (key.match(regEx) !== null) {
      matchesSome = true;
      break;
    }
  }

  // userId depends on startup options so it's dynamic
  const valid = matchesSome || key.match(userIdRegExp) !== null;
  if (!valid) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid key for class level permissions`);
  }
}
function validateProtectedFieldsKey(key, userIdRegExp) {
  let matchesSome = false;
  for (const regEx of protectedFieldsRegex) {
    if (key.match(regEx) !== null) {
      matchesSome = true;
      break;
    }
  }

  // userId regex depends on launch options so it's dynamic
  const valid = matchesSome || key.match(userIdRegExp) !== null;
  if (!valid) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid key for class level permissions`);
  }
}
const CLPValidKeys = Object.freeze(['find', 'count', 'get', 'create', 'update', 'delete', 'addField', 'readUserFields', 'writeUserFields', 'protectedFields']);

// validation before setting class-level permissions on collection
function validateCLP(perms, fields, userIdRegExp) {
  if (!perms) {
    return;
  }
  for (const operationKey in perms) {
    if (CLPValidKeys.indexOf(operationKey) == -1) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `${operationKey} is not a valid operation for class level permissions`);
    }
    const operation = perms[operationKey];
    // proceed with next operationKey

    // throws when root fields are of wrong type
    validateCLPjson(operation, operationKey);
    if (operationKey === 'readUserFields' || operationKey === 'writeUserFields') {
      // validate grouped pointer permissions
      // must be an array with field names
      for (const fieldName of operation) {
        validatePointerPermission(fieldName, fields, operationKey);
      }
      // readUserFields and writerUserFields do not have nesdted fields
      // proceed with next operationKey
      continue;
    }

    // validate protected fields
    if (operationKey === 'protectedFields') {
      for (const entity in operation) {
        // throws on unexpected key
        validateProtectedFieldsKey(entity, userIdRegExp);
        const protectedFields = operation[entity];
        if (!Array.isArray(protectedFields)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${protectedFields}' is not a valid value for protectedFields[${entity}] - expected an array.`);
        }

        // if the field is in form of array
        for (const field of protectedFields) {
          // do not alloow to protect default fields
          if (defaultColumns._Default[field]) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Default field '${field}' can not be protected`);
          }
          // field should exist on collection
          if (!Object.prototype.hasOwnProperty.call(fields, field)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Field '${field}' in protectedFields:${entity} does not exist`);
          }
        }
      }
      // proceed with next operationKey
      continue;
    }

    // validate other fields
    // Entity can be:
    // "*" - Public,
    // "requiresAuthentication" - authenticated users,
    // "objectId" - _User id,
    // "role:rolename",
    // "pointerFields" - array of field names containing pointers to users
    for (const entity in operation) {
      // throws on unexpected key
      validatePermissionKey(entity, userIdRegExp);

      // entity can be either:
      // "pointerFields": string[]
      if (entity === 'pointerFields') {
        const pointerFields = operation[entity];
        if (Array.isArray(pointerFields)) {
          for (const pointerField of pointerFields) {
            validatePointerPermission(pointerField, fields, operation);
          }
        } else {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${pointerFields}' is not a valid value for ${operationKey}[${entity}] - expected an array.`);
        }
        // proceed with next entity key
        continue;
      }

      // or [entity]: boolean
      const permit = operation[entity];
      if (permit !== true) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `'${permit}' is not a valid value for class level permissions ${operationKey}:${entity}:${permit}`);
      }
    }
  }
}
function validateCLPjson(operation, operationKey) {
  if (operationKey === 'readUserFields' || operationKey === 'writeUserFields') {
    if (!Array.isArray(operation)) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `'${operation}' is not a valid value for class level permissions ${operationKey} - must be an array`);
    }
  } else {
    if (typeof operation === 'object' && operation !== null) {
      // ok to proceed
      return;
    } else {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `'${operation}' is not a valid value for class level permissions ${operationKey} - must be an object`);
    }
  }
}
function validatePointerPermission(fieldName, fields, operation) {
  // Uses collection schema to ensure the field is of type:
  // - Pointer<_User> (pointers)
  // - Array
  //
  //    It's not possible to enforce type on Array's items in schema
  //  so we accept any Array field, and later when applying permissions
  //  only items that are pointers to _User are considered.
  if (!(fields[fieldName] && (fields[fieldName].type == 'Pointer' && fields[fieldName].targetClass == '_User' || fields[fieldName].type == 'Array'))) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${fieldName}' is not a valid column for class level pointer permissions ${operation}`);
  }
}
const joinClassRegex = /^_Join:[A-Za-z0-9_]+:[A-Za-z0-9_]+/;
const classAndFieldRegex = /^[A-Za-z][A-Za-z0-9_]*$/;
function classNameIsValid(className) {
  // Valid classes must:
  return (
    // Be one of _User, _Installation, _Role, _Session OR
    systemClasses.indexOf(className) > -1 ||
    // Be a join table OR
    joinClassRegex.test(className) ||
    // Include only alpha-numeric and underscores, and not start with an underscore or number
    fieldNameIsValid(className, className)
  );
}

// Valid fields must be alpha-numeric, and not start with an underscore or number
// must not be a reserved key
function fieldNameIsValid(fieldName, className) {
  if (className && className !== '_Hooks') {
    if (fieldName === 'className') {
      return false;
    }
  }
  return classAndFieldRegex.test(fieldName) && !invalidColumns.includes(fieldName);
}

// Checks that it's not trying to clobber one of the default fields of the class.
function fieldNameIsValidForClass(fieldName, className) {
  if (!fieldNameIsValid(fieldName, className)) {
    return false;
  }
  if (defaultColumns._Default[fieldName]) {
    return false;
  }
  if (defaultColumns[className] && defaultColumns[className][fieldName]) {
    return false;
  }
  return true;
}
function invalidClassNameMessage(className) {
  return 'Invalid classname: ' + className + ', classnames can only have alphanumeric characters and _, and must start with an alpha character ';
}
const invalidJsonError = new Parse.Error(Parse.Error.INVALID_JSON, 'invalid JSON');
const validNonRelationOrPointerTypes = ['Number', 'String', 'Boolean', 'Date', 'Object', 'Array', 'GeoPoint', 'File', 'Bytes', 'Polygon'];
// Returns an error suitable for throwing if the type is invalid
const fieldTypeIsInvalid = ({
  type,
  targetClass
}) => {
  if (['Pointer', 'Relation'].indexOf(type) >= 0) {
    if (!targetClass) {
      return new Parse.Error(135, `type ${type} needs a class name`);
    } else if (typeof targetClass !== 'string') {
      return invalidJsonError;
    } else if (!classNameIsValid(targetClass)) {
      return new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(targetClass));
    } else {
      return undefined;
    }
  }
  if (typeof type !== 'string') {
    return invalidJsonError;
  }
  if (validNonRelationOrPointerTypes.indexOf(type) < 0) {
    return new Parse.Error(Parse.Error.INCORRECT_TYPE, `invalid field type: ${type}`);
  }
  return undefined;
};
const convertSchemaToAdapterSchema = schema => {
  schema = injectDefaultSchema(schema);
  delete schema.fields.ACL;
  schema.fields._rperm = {
    type: 'Array'
  };
  schema.fields._wperm = {
    type: 'Array'
  };
  if (schema.className === '_User') {
    delete schema.fields.password;
    schema.fields._hashed_password = {
      type: 'String'
    };
  }
  return schema;
};
exports.convertSchemaToAdapterSchema = convertSchemaToAdapterSchema;
const convertAdapterSchemaToParseSchema = _ref => {
  let schema = _extends({}, _ref);
  delete schema.fields._rperm;
  delete schema.fields._wperm;
  schema.fields.ACL = {
    type: 'ACL'
  };
  if (schema.className === '_User') {
    delete schema.fields.authData; //Auth data is implicit
    delete schema.fields._hashed_password;
    schema.fields.password = {
      type: 'String'
    };
  }
  if (schema.indexes && Object.keys(schema.indexes).length === 0) {
    delete schema.indexes;
  }
  return schema;
};
class SchemaData {
  constructor(allSchemas = [], protectedFields = {}) {
    this.__data = {};
    this.__protectedFields = protectedFields;
    allSchemas.forEach(schema => {
      if (volatileClasses.includes(schema.className)) {
        return;
      }
      Object.defineProperty(this, schema.className, {
        get: () => {
          if (!this.__data[schema.className]) {
            const data = {};
            data.fields = injectDefaultSchema(schema).fields;
            data.classLevelPermissions = (0, _deepcopy.default)(schema.classLevelPermissions);
            data.indexes = schema.indexes;
            const classProtectedFields = this.__protectedFields[schema.className];
            if (classProtectedFields) {
              for (const key in classProtectedFields) {
                const unq = new Set([...(data.classLevelPermissions.protectedFields[key] || []), ...classProtectedFields[key]]);
                data.classLevelPermissions.protectedFields[key] = Array.from(unq);
              }
            }
            this.__data[schema.className] = data;
          }
          return this.__data[schema.className];
        }
      });
    });

    // Inject the in-memory classes
    volatileClasses.forEach(className => {
      Object.defineProperty(this, className, {
        get: () => {
          if (!this.__data[className]) {
            const schema = injectDefaultSchema({
              className,
              fields: {},
              classLevelPermissions: {}
            });
            const data = {};
            data.fields = schema.fields;
            data.classLevelPermissions = schema.classLevelPermissions;
            data.indexes = schema.indexes;
            this.__data[className] = data;
          }
          return this.__data[className];
        }
      });
    });
  }
}
const injectDefaultSchema = ({
  className,
  fields,
  classLevelPermissions,
  indexes
}) => {
  const defaultSchema = {
    className,
    fields: _objectSpread(_objectSpread(_objectSpread({}, defaultColumns._Default), defaultColumns[className] || {}), fields),
    classLevelPermissions
  };
  if (indexes && Object.keys(indexes).length !== 0) {
    defaultSchema.indexes = indexes;
  }
  return defaultSchema;
};
const _HooksSchema = {
  className: '_Hooks',
  fields: defaultColumns._Hooks
};
const _GlobalConfigSchema = {
  className: '_GlobalConfig',
  fields: defaultColumns._GlobalConfig
};
const _GraphQLConfigSchema = {
  className: '_GraphQLConfig',
  fields: defaultColumns._GraphQLConfig
};
const _PushStatusSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_PushStatus',
  fields: {},
  classLevelPermissions: {}
}));
const _JobStatusSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_JobStatus',
  fields: {},
  classLevelPermissions: {}
}));
const _JobScheduleSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_JobSchedule',
  fields: {},
  classLevelPermissions: {}
}));
const _AudienceSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_Audience',
  fields: defaultColumns._Audience,
  classLevelPermissions: {}
}));
const _IdempotencySchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_Idempotency',
  fields: defaultColumns._Idempotency,
  classLevelPermissions: {}
}));
const VolatileClassesSchemas = exports.VolatileClassesSchemas = [_HooksSchema, _JobStatusSchema, _JobScheduleSchema, _PushStatusSchema, _GlobalConfigSchema, _GraphQLConfigSchema, _AudienceSchema, _IdempotencySchema];
const dbTypeMatchesObjectType = (dbType, objectType) => {
  if (dbType.type !== objectType.type) return false;
  if (dbType.targetClass !== objectType.targetClass) return false;
  if (dbType === objectType.type) return true;
  if (dbType.type === objectType.type) return true;
  return false;
};
const typeToString = type => {
  if (typeof type === 'string') {
    return type;
  }
  if (type.targetClass) {
    return `${type.type}<${type.targetClass}>`;
  }
  return `${type.type}`;
};
const ttl = {
  date: Date.now(),
  duration: undefined
};

// Stores the entire schema of the app in a weird hybrid format somewhere between
// the mongo format and the Parse format. Soon, this will all be Parse format.
class SchemaController {
  constructor(databaseAdapter) {
    this._dbAdapter = databaseAdapter;
    const config = _Config.default.get(Parse.applicationId);
    this.schemaData = new SchemaData(_SchemaCache.default.all(), this.protectedFields);
    this.protectedFields = config.protectedFields;
    const customIds = config.allowCustomObjectId;
    const customIdRegEx = /^.{1,}$/u; // 1+ chars
    const autoIdRegEx = /^[a-zA-Z0-9]{1,}$/;
    this.userIdRegEx = customIds ? customIdRegEx : autoIdRegEx;
    this._dbAdapter.watch(() => {
      this.reloadData({
        clearCache: true
      });
    });
  }
  async reloadDataIfNeeded() {
    if (this._dbAdapter.enableSchemaHooks) {
      return;
    }
    const {
      date,
      duration
    } = ttl || {};
    if (!duration) {
      return;
    }
    const now = Date.now();
    if (now - date > duration) {
      ttl.date = now;
      await this.reloadData({
        clearCache: true
      });
    }
  }
  reloadData(options = {
    clearCache: false
  }) {
    if (this.reloadDataPromise && !options.clearCache) {
      return this.reloadDataPromise;
    }
    this.reloadDataPromise = this.getAllClasses(options).then(allSchemas => {
      this.schemaData = new SchemaData(allSchemas, this.protectedFields);
      delete this.reloadDataPromise;
    }, err => {
      this.schemaData = new SchemaData();
      delete this.reloadDataPromise;
      throw err;
    }).then(() => {});
    return this.reloadDataPromise;
  }
  async getAllClasses(options = {
    clearCache: false
  }) {
    if (options.clearCache) {
      return this.setAllClasses();
    }
    await this.reloadDataIfNeeded();
    const cached = _SchemaCache.default.all();
    if (cached && cached.length) {
      return Promise.resolve(cached);
    }
    return this.setAllClasses();
  }
  setAllClasses() {
    return this._dbAdapter.getAllClasses().then(allSchemas => allSchemas.map(injectDefaultSchema)).then(allSchemas => {
      _SchemaCache.default.put(allSchemas);
      return allSchemas;
    });
  }
  getOneSchema(className, allowVolatileClasses = false, options = {
    clearCache: false
  }) {
    if (options.clearCache) {
      _SchemaCache.default.clear();
    }
    if (allowVolatileClasses && volatileClasses.indexOf(className) > -1) {
      const data = this.schemaData[className];
      return Promise.resolve({
        className,
        fields: data.fields,
        classLevelPermissions: data.classLevelPermissions,
        indexes: data.indexes
      });
    }
    const cached = _SchemaCache.default.get(className);
    if (cached && !options.clearCache) {
      return Promise.resolve(cached);
    }
    return this.setAllClasses().then(allSchemas => {
      const oneSchema = allSchemas.find(schema => schema.className === className);
      if (!oneSchema) {
        return Promise.reject(undefined);
      }
      return oneSchema;
    });
  }

  // Create a new class that includes the three default fields.
  // ACL is an implicit column that does not get an entry in the
  // _SCHEMAS database. Returns a promise that resolves with the
  // created schema, in mongo format.
  // on success, and rejects with an error on fail. Ensure you
  // have authorization (master key, or client class creation
  // enabled) before calling this function.
  async addClassIfNotExists(className, fields = {}, classLevelPermissions, indexes = {}) {
    var validationError = this.validateNewClass(className, fields, classLevelPermissions);
    if (validationError) {
      if (validationError instanceof Parse.Error) {
        return Promise.reject(validationError);
      } else if (validationError.code && validationError.error) {
        return Promise.reject(new Parse.Error(validationError.code, validationError.error));
      }
      return Promise.reject(validationError);
    }
    try {
      const adapterSchema = await this._dbAdapter.createClass(className, convertSchemaToAdapterSchema({
        fields,
        classLevelPermissions,
        indexes,
        className
      }));
      // TODO: Remove by updating schema cache directly
      await this.reloadData({
        clearCache: true
      });
      const parseSchema = convertAdapterSchemaToParseSchema(adapterSchema);
      return parseSchema;
    } catch (error) {
      if (error && error.code === Parse.Error.DUPLICATE_VALUE) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
      } else {
        throw error;
      }
    }
  }
  updateClass(className, submittedFields, classLevelPermissions, indexes, database) {
    return this.getOneSchema(className).then(schema => {
      const existingFields = schema.fields;
      Object.keys(submittedFields).forEach(name => {
        const field = submittedFields[name];
        if (existingFields[name] && existingFields[name].type !== field.type && field.__op !== 'Delete') {
          throw new Parse.Error(255, `Field ${name} exists, cannot update.`);
        }
        if (!existingFields[name] && field.__op === 'Delete') {
          throw new Parse.Error(255, `Field ${name} does not exist, cannot delete.`);
        }
      });
      delete existingFields._rperm;
      delete existingFields._wperm;
      const newSchema = buildMergedSchemaObject(existingFields, submittedFields);
      const defaultFields = defaultColumns[className] || defaultColumns._Default;
      const fullNewSchema = Object.assign({}, newSchema, defaultFields);
      const validationError = this.validateSchemaData(className, newSchema, classLevelPermissions, Object.keys(existingFields));
      if (validationError) {
        throw new Parse.Error(validationError.code, validationError.error);
      }

      // Finally we have checked to make sure the request is valid and we can start deleting fields.
      // Do all deletions first, then a single save to _SCHEMA collection to handle all additions.
      const deletedFields = [];
      const insertedFields = [];
      Object.keys(submittedFields).forEach(fieldName => {
        if (submittedFields[fieldName].__op === 'Delete') {
          deletedFields.push(fieldName);
        } else {
          insertedFields.push(fieldName);
        }
      });
      let deletePromise = Promise.resolve();
      if (deletedFields.length > 0) {
        deletePromise = this.deleteFields(deletedFields, className, database);
      }
      let enforceFields = [];
      return deletePromise // Delete Everything
      .then(() => this.reloadData({
        clearCache: true
      })) // Reload our Schema, so we have all the new values
      .then(() => {
        const promises = insertedFields.map(fieldName => {
          const type = submittedFields[fieldName];
          return this.enforceFieldExists(className, fieldName, type);
        });
        return Promise.all(promises);
      }).then(results => {
        enforceFields = results.filter(result => !!result);
        return this.setPermissions(className, classLevelPermissions, newSchema);
      }).then(() => this._dbAdapter.setIndexesWithSchemaFormat(className, indexes, schema.indexes, fullNewSchema)).then(() => this.reloadData({
        clearCache: true
      }))
      //TODO: Move this logic into the database adapter
      .then(() => {
        this.ensureFields(enforceFields);
        const schema = this.schemaData[className];
        const reloadedSchema = {
          className: className,
          fields: schema.fields,
          classLevelPermissions: schema.classLevelPermissions
        };
        if (schema.indexes && Object.keys(schema.indexes).length !== 0) {
          reloadedSchema.indexes = schema.indexes;
        }
        return reloadedSchema;
      });
    }).catch(error => {
      if (error === undefined) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
      } else {
        throw error;
      }
    });
  }

  // Returns a promise that resolves successfully to the new schema
  // object or fails with a reason.
  enforceClassExists(className) {
    if (this.schemaData[className]) {
      return Promise.resolve(this);
    }
    // We don't have this class. Update the schema
    return (
      // The schema update succeeded. Reload the schema
      this.addClassIfNotExists(className).catch(() => {
        // The schema update failed. This can be okay - it might
        // have failed because there's a race condition and a different
        // client is making the exact same schema update that we want.
        // So just reload the schema.
        return this.reloadData({
          clearCache: true
        });
      }).then(() => {
        // Ensure that the schema now validates
        if (this.schemaData[className]) {
          return this;
        } else {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `Failed to add ${className}`);
        }
      }).catch(() => {
        // The schema still doesn't validate. Give up
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'schema class name does not revalidate');
      })
    );
  }
  validateNewClass(className, fields = {}, classLevelPermissions) {
    if (this.schemaData[className]) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
    }
    if (!classNameIsValid(className)) {
      return {
        code: Parse.Error.INVALID_CLASS_NAME,
        error: invalidClassNameMessage(className)
      };
    }
    return this.validateSchemaData(className, fields, classLevelPermissions, []);
  }
  validateSchemaData(className, fields, classLevelPermissions, existingFieldNames) {
    for (const fieldName in fields) {
      if (existingFieldNames.indexOf(fieldName) < 0) {
        if (!fieldNameIsValid(fieldName, className)) {
          return {
            code: Parse.Error.INVALID_KEY_NAME,
            error: 'invalid field name: ' + fieldName
          };
        }
        if (!fieldNameIsValidForClass(fieldName, className)) {
          return {
            code: 136,
            error: 'field ' + fieldName + ' cannot be added'
          };
        }
        const fieldType = fields[fieldName];
        const error = fieldTypeIsInvalid(fieldType);
        if (error) return {
          code: error.code,
          error: error.message
        };
        if (fieldType.defaultValue !== undefined) {
          let defaultValueType = getType(fieldType.defaultValue);
          if (typeof defaultValueType === 'string') {
            defaultValueType = {
              type: defaultValueType
            };
          } else if (typeof defaultValueType === 'object' && fieldType.type === 'Relation') {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `The 'default value' option is not applicable for ${typeToString(fieldType)}`
            };
          }
          if (!dbTypeMatchesObjectType(fieldType, defaultValueType)) {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `schema mismatch for ${className}.${fieldName} default value; expected ${typeToString(fieldType)} but got ${typeToString(defaultValueType)}`
            };
          }
        } else if (fieldType.required) {
          if (typeof fieldType === 'object' && fieldType.type === 'Relation') {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `The 'required' option is not applicable for ${typeToString(fieldType)}`
            };
          }
        }
      }
    }
    for (const fieldName in defaultColumns[className]) {
      fields[fieldName] = defaultColumns[className][fieldName];
    }
    const geoPoints = Object.keys(fields).filter(key => fields[key] && fields[key].type === 'GeoPoint');
    if (geoPoints.length > 1) {
      return {
        code: Parse.Error.INCORRECT_TYPE,
        error: 'currently, only one GeoPoint field may exist in an object. Adding ' + geoPoints[1] + ' when ' + geoPoints[0] + ' already exists.'
      };
    }
    validateCLP(classLevelPermissions, fields, this.userIdRegEx);
  }

  // Sets the Class-level permissions for a given className, which must exist.
  async setPermissions(className, perms, newSchema) {
    if (typeof perms === 'undefined') {
      return Promise.resolve();
    }
    validateCLP(perms, newSchema, this.userIdRegEx);
    await this._dbAdapter.setClassLevelPermissions(className, perms);
    const cached = _SchemaCache.default.get(className);
    if (cached) {
      cached.classLevelPermissions = perms;
    }
  }

  // Returns a promise that resolves successfully to the new schema
  // object if the provided className-fieldName-type tuple is valid.
  // The className must already be validated.
  // If 'freeze' is true, refuse to update the schema for this field.
  enforceFieldExists(className, fieldName, type, isValidation, maintenance) {
    if (fieldName.indexOf('.') > 0) {
      // subdocument key (x.y) => ok if x is of type 'object'
      fieldName = fieldName.split('.')[0];
      type = 'Object';
    }
    let fieldNameToValidate = `${fieldName}`;
    if (maintenance && fieldNameToValidate.charAt(0) === '_') {
      fieldNameToValidate = fieldNameToValidate.substring(1);
    }
    if (!fieldNameIsValid(fieldNameToValidate, className)) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
    }

    // If someone tries to create a new field with null/undefined as the value, return;
    if (!type) {
      return undefined;
    }
    const expectedType = this.getExpectedType(className, fieldName);
    if (typeof type === 'string') {
      type = {
        type
      };
    }
    if (type.defaultValue !== undefined) {
      let defaultValueType = getType(type.defaultValue);
      if (typeof defaultValueType === 'string') {
        defaultValueType = {
          type: defaultValueType
        };
      }
      if (!dbTypeMatchesObjectType(type, defaultValueType)) {
        throw new Parse.Error(Parse.Error.INCORRECT_TYPE, `schema mismatch for ${className}.${fieldName} default value; expected ${typeToString(type)} but got ${typeToString(defaultValueType)}`);
      }
    }
    if (expectedType) {
      if (!dbTypeMatchesObjectType(expectedType, type)) {
        throw new Parse.Error(Parse.Error.INCORRECT_TYPE, `schema mismatch for ${className}.${fieldName}; expected ${typeToString(expectedType)} but got ${typeToString(type)}`);
      }
      // If type options do not change
      // we can safely return
      if (isValidation || JSON.stringify(expectedType) === JSON.stringify(type)) {
        return undefined;
      }
      // Field options are may be changed
      // ensure to have an update to date schema field
      return this._dbAdapter.updateFieldOptions(className, fieldName, type);
    }
    return this._dbAdapter.addFieldIfNotExists(className, fieldName, type).catch(error => {
      if (error.code == Parse.Error.INCORRECT_TYPE) {
        // Make sure that we throw errors when it is appropriate to do so.
        throw error;
      }
      // The update failed. This can be okay - it might have been a race
      // condition where another client updated the schema in the same
      // way that we wanted to. So, just reload the schema
      return Promise.resolve();
    }).then(() => {
      return {
        className,
        fieldName,
        type
      };
    });
  }
  ensureFields(fields) {
    for (let i = 0; i < fields.length; i += 1) {
      const {
        className,
        fieldName
      } = fields[i];
      let {
        type
      } = fields[i];
      const expectedType = this.getExpectedType(className, fieldName);
      if (typeof type === 'string') {
        type = {
          type: type
        };
      }
      if (!expectedType || !dbTypeMatchesObjectType(expectedType, type)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `Could not add field ${fieldName}`);
      }
    }
  }

  // maintain compatibility
  deleteField(fieldName, className, database) {
    return this.deleteFields([fieldName], className, database);
  }

  // Delete fields, and remove that data from all objects. This is intended
  // to remove unused fields, if other writers are writing objects that include
  // this field, the field may reappear. Returns a Promise that resolves with
  // no object on success, or rejects with { code, error } on failure.
  // Passing the database and prefix is necessary in order to drop relation collections
  // and remove fields from objects. Ideally the database would belong to
  // a database adapter and this function would close over it or access it via member.
  deleteFields(fieldNames, className, database) {
    if (!classNameIsValid(className)) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(className));
    }
    fieldNames.forEach(fieldName => {
      if (!fieldNameIsValid(fieldName, className)) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `invalid field name: ${fieldName}`);
      }
      //Don't allow deleting the default fields.
      if (!fieldNameIsValidForClass(fieldName, className)) {
        throw new Parse.Error(136, `field ${fieldName} cannot be changed`);
      }
    });
    return this.getOneSchema(className, false, {
      clearCache: true
    }).catch(error => {
      if (error === undefined) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
      } else {
        throw error;
      }
    }).then(schema => {
      fieldNames.forEach(fieldName => {
        if (!schema.fields[fieldName]) {
          throw new Parse.Error(255, `Field ${fieldName} does not exist, cannot delete.`);
        }
      });
      const schemaFields = _objectSpread({}, schema.fields);
      return database.adapter.deleteFields(className, schema, fieldNames).then(() => {
        return Promise.all(fieldNames.map(fieldName => {
          const field = schemaFields[fieldName];
          if (field && field.type === 'Relation') {
            //For relations, drop the _Join table
            return database.adapter.deleteClass(`_Join:${fieldName}:${className}`);
          }
          return Promise.resolve();
        }));
      });
    }).then(() => {
      _SchemaCache.default.clear();
    });
  }

  // Validates an object provided in REST format.
  // Returns a promise that resolves to the new schema if this object is
  // valid.
  async validateObject(className, object, query, maintenance) {
    let geocount = 0;
    const schema = await this.enforceClassExists(className);
    const promises = [];
    for (const fieldName in object) {
      if (object[fieldName] && getType(object[fieldName]) === 'GeoPoint') {
        geocount++;
      }
      if (geocount > 1) {
        return Promise.reject(new Parse.Error(Parse.Error.INCORRECT_TYPE, 'there can only be one geopoint field in a class'));
      }
    }
    for (const fieldName in object) {
      if (object[fieldName] === undefined) {
        continue;
      }
      const expected = getType(object[fieldName]);
      if (!expected) {
        continue;
      }
      if (fieldName === 'ACL') {
        // Every object has ACL implicitly.
        continue;
      }
      promises.push(schema.enforceFieldExists(className, fieldName, expected, true, maintenance));
    }
    const results = await Promise.all(promises);
    const enforceFields = results.filter(result => !!result);
    if (enforceFields.length !== 0) {
      // TODO: Remove by updating schema cache directly
      await this.reloadData({
        clearCache: true
      });
    }
    this.ensureFields(enforceFields);
    const promise = Promise.resolve(schema);
    return thenValidateRequiredColumns(promise, className, object, query);
  }

  // Validates that all the properties are set for the object
  validateRequiredColumns(className, object, query) {
    const columns = requiredColumns.write[className];
    if (!columns || columns.length == 0) {
      return Promise.resolve(this);
    }
    const missingColumns = columns.filter(function (column) {
      if (query && query.objectId) {
        if (object[column] && typeof object[column] === 'object') {
          // Trying to delete a required column
          return object[column].__op == 'Delete';
        }
        // Not trying to do anything there
        return false;
      }
      return !object[column];
    });
    if (missingColumns.length > 0) {
      throw new Parse.Error(Parse.Error.INCORRECT_TYPE, missingColumns[0] + ' is required.');
    }
    return Promise.resolve(this);
  }
  testPermissionsForClassName(className, aclGroup, operation) {
    return SchemaController.testPermissions(this.getClassLevelPermissions(className), aclGroup, operation);
  }

  // Tests that the class level permission let pass the operation for a given aclGroup
  static testPermissions(classPermissions, aclGroup, operation) {
    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }
    const perms = classPermissions[operation];
    if (perms['*']) {
      return true;
    }
    // Check permissions against the aclGroup provided (array of userId/roles)
    if (aclGroup.some(acl => {
      return perms[acl] === true;
    })) {
      return true;
    }
    return false;
  }

  // Validates an operation passes class-level-permissions set in the schema
  static validatePermission(classPermissions, className, aclGroup, operation, action) {
    if (SchemaController.testPermissions(classPermissions, aclGroup, operation)) {
      return Promise.resolve();
    }
    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }
    const perms = classPermissions[operation];
    // If only for authenticated users
    // make sure we have an aclGroup
    if (perms['requiresAuthentication']) {
      // If aclGroup has * (public)
      if (!aclGroup || aclGroup.length == 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.');
      } else if (aclGroup.indexOf('*') > -1 && aclGroup.length == 1) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.');
      }
      // requiresAuthentication passed, just move forward
      // probably would be wise at some point to rename to 'authenticatedUser'
      return Promise.resolve();
    }

    // No matching CLP, let's check the Pointer permissions
    // And handle those later
    const permissionField = ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';

    // Reject create when write lockdown
    if (permissionField == 'writeUserFields' && operation == 'create') {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Permission denied for action ${operation} on class ${className}.`);
    }

    // Process the readUserFields later
    if (Array.isArray(classPermissions[permissionField]) && classPermissions[permissionField].length > 0) {
      return Promise.resolve();
    }
    const pointerFields = classPermissions[operation].pointerFields;
    if (Array.isArray(pointerFields) && pointerFields.length > 0) {
      // any op except 'addField as part of create' is ok.
      if (operation !== 'addField' || action === 'update') {
        // We can allow adding field on update flow only.
        return Promise.resolve();
      }
    }
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Permission denied for action ${operation} on class ${className}.`);
  }

  // Validates an operation passes class-level-permissions set in the schema
  validatePermission(className, aclGroup, operation, action) {
    return SchemaController.validatePermission(this.getClassLevelPermissions(className), className, aclGroup, operation, action);
  }
  getClassLevelPermissions(className) {
    return this.schemaData[className] && this.schemaData[className].classLevelPermissions;
  }

  // Returns the expected type for a className+key combination
  // or undefined if the schema is not set
  getExpectedType(className, fieldName) {
    if (this.schemaData[className]) {
      const expectedType = this.schemaData[className].fields[fieldName];
      return expectedType === 'map' ? 'Object' : expectedType;
    }
    return undefined;
  }

  // Checks if a given class is in the schema.
  hasClass(className) {
    if (this.schemaData[className]) {
      return Promise.resolve(true);
    }
    return this.reloadData().then(() => !!this.schemaData[className]);
  }
}

// Returns a promise for a new Schema.
exports.SchemaController = exports.default = SchemaController;
const load = (dbAdapter, options) => {
  const schema = new SchemaController(dbAdapter);
  ttl.duration = dbAdapter.schemaCacheTtl;
  return schema.reloadData(options).then(() => schema);
};

// Builds a new schema (in schema API response format) out of an
// existing mongo schema + a schemas API put request. This response
// does not include the default fields, as it is intended to be passed
// to mongoSchemaFromFieldsAndClassName. No validation is done here, it
// is done in mongoSchemaFromFieldsAndClassName.
exports.load = load;
function buildMergedSchemaObject(existingFields, putRequest) {
  const newSchema = {};
  // -disable-next
  const sysSchemaField = Object.keys(defaultColumns).indexOf(existingFields._id) === -1 ? [] : Object.keys(defaultColumns[existingFields._id]);
  for (const oldField in existingFields) {
    if (oldField !== '_id' && oldField !== 'ACL' && oldField !== 'updatedAt' && oldField !== 'createdAt' && oldField !== 'objectId') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(oldField) !== -1) {
        continue;
      }
      const fieldIsDeleted = putRequest[oldField] && putRequest[oldField].__op === 'Delete';
      if (!fieldIsDeleted) {
        newSchema[oldField] = existingFields[oldField];
      }
    }
  }
  for (const newField in putRequest) {
    if (newField !== 'objectId' && putRequest[newField].__op !== 'Delete') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(newField) !== -1) {
        continue;
      }
      newSchema[newField] = putRequest[newField];
    }
  }
  return newSchema;
}

// Given a schema promise, construct another schema promise that
// validates this field once the schema loads.
function thenValidateRequiredColumns(schemaPromise, className, object, query) {
  return schemaPromise.then(schema => {
    return schema.validateRequiredColumns(className, object, query);
  });
}

// Gets the type from a REST API formatted object, where 'type' is
// extended past javascript types to include the rest of the Parse
// type system.
// The output should be a valid schema value.
// TODO: ensure that this is compatible with the format used in Open DB
function getType(obj) {
  const type = typeof obj;
  switch (type) {
    case 'boolean':
      return 'Boolean';
    case 'string':
      return 'String';
    case 'number':
      return 'Number';
    case 'map':
    case 'object':
      if (!obj) {
        return undefined;
      }
      return getObjectType(obj);
    case 'function':
    case 'symbol':
    case 'undefined':
    default:
      throw 'bad obj: ' + obj;
  }
}

// This gets the type for non-JSON types like pointers and files, but
// also gets the appropriate type for $ operators.
// Returns null if the type is unknown.
function getObjectType(obj) {
  if (obj instanceof Array) {
    return 'Array';
  }
  if (obj.__type) {
    switch (obj.__type) {
      case 'Pointer':
        if (obj.className) {
          return {
            type: 'Pointer',
            targetClass: obj.className
          };
        }
        break;
      case 'Relation':
        if (obj.className) {
          return {
            type: 'Relation',
            targetClass: obj.className
          };
        }
        break;
      case 'File':
        if (obj.name) {
          return 'File';
        }
        break;
      case 'Date':
        if (obj.iso) {
          return 'Date';
        }
        break;
      case 'GeoPoint':
        if (obj.latitude != null && obj.longitude != null) {
          return 'GeoPoint';
        }
        break;
      case 'Bytes':
        if (obj.base64) {
          return 'Bytes';
        }
        break;
      case 'Polygon':
        if (obj.coordinates) {
          return 'Polygon';
        }
        break;
    }
    throw new Parse.Error(Parse.Error.INCORRECT_TYPE, 'This is not a valid ' + obj.__type);
  }
  if (obj['$ne']) {
    return getObjectType(obj['$ne']);
  }
  if (obj.__op) {
    switch (obj.__op) {
      case 'Increment':
        return 'Number';
      case 'Delete':
        return null;
      case 'Add':
      case 'AddUnique':
      case 'Remove':
        return 'Array';
      case 'AddRelation':
      case 'RemoveRelation':
        return {
          type: 'Relation',
          targetClass: obj.objects[0].className
        };
      case 'Batch':
        return getObjectType(obj.ops[0]);
      default:
        throw 'unexpected op: ' + obj.__op;
    }
  }
  return 'Object';
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfU3RvcmFnZUFkYXB0ZXIiLCJyZXF1aXJlIiwiX1NjaGVtYUNhY2hlIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9EYXRhYmFzZUNvbnRyb2xsZXIiLCJfQ29uZmlnIiwiX2RlZXBjb3B5Iiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwiZSIsInIiLCJ0IiwiT2JqZWN0Iiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5Iiwia2V5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiaSIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIl9leHRlbmRzIiwiYXNzaWduIiwiYmluZCIsInRhcmdldCIsInNvdXJjZSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiUGFyc2UiLCJkZWZhdWx0Q29sdW1ucyIsImV4cG9ydHMiLCJmcmVlemUiLCJfRGVmYXVsdCIsIm9iamVjdElkIiwidHlwZSIsImNyZWF0ZWRBdCIsInVwZGF0ZWRBdCIsIkFDTCIsIl9Vc2VyIiwidXNlcm5hbWUiLCJwYXNzd29yZCIsImVtYWlsIiwiZW1haWxWZXJpZmllZCIsImF1dGhEYXRhIiwiX0luc3RhbGxhdGlvbiIsImluc3RhbGxhdGlvbklkIiwiZGV2aWNlVG9rZW4iLCJjaGFubmVscyIsImRldmljZVR5cGUiLCJwdXNoVHlwZSIsIkdDTVNlbmRlcklkIiwidGltZVpvbmUiLCJsb2NhbGVJZGVudGlmaWVyIiwiYmFkZ2UiLCJhcHBWZXJzaW9uIiwiYXBwTmFtZSIsImFwcElkZW50aWZpZXIiLCJwYXJzZVZlcnNpb24iLCJfUm9sZSIsIm5hbWUiLCJ1c2VycyIsInRhcmdldENsYXNzIiwicm9sZXMiLCJfU2Vzc2lvbiIsInVzZXIiLCJzZXNzaW9uVG9rZW4iLCJleHBpcmVzQXQiLCJjcmVhdGVkV2l0aCIsIl9Qcm9kdWN0IiwicHJvZHVjdElkZW50aWZpZXIiLCJkb3dubG9hZCIsImRvd25sb2FkTmFtZSIsImljb24iLCJvcmRlciIsInRpdGxlIiwic3VidGl0bGUiLCJfUHVzaFN0YXR1cyIsInB1c2hUaW1lIiwicXVlcnkiLCJwYXlsb2FkIiwiZXhwaXJ5IiwiZXhwaXJhdGlvbl9pbnRlcnZhbCIsInN0YXR1cyIsIm51bVNlbnQiLCJudW1GYWlsZWQiLCJwdXNoSGFzaCIsImVycm9yTWVzc2FnZSIsInNlbnRQZXJUeXBlIiwiZmFpbGVkUGVyVHlwZSIsInNlbnRQZXJVVENPZmZzZXQiLCJmYWlsZWRQZXJVVENPZmZzZXQiLCJjb3VudCIsIl9Kb2JTdGF0dXMiLCJqb2JOYW1lIiwibWVzc2FnZSIsInBhcmFtcyIsImZpbmlzaGVkQXQiLCJfSm9iU2NoZWR1bGUiLCJkZXNjcmlwdGlvbiIsInN0YXJ0QWZ0ZXIiLCJkYXlzT2ZXZWVrIiwidGltZU9mRGF5IiwibGFzdFJ1biIsInJlcGVhdE1pbnV0ZXMiLCJfSG9va3MiLCJmdW5jdGlvbk5hbWUiLCJjbGFzc05hbWUiLCJ0cmlnZ2VyTmFtZSIsInVybCIsIl9HbG9iYWxDb25maWciLCJtYXN0ZXJLZXlPbmx5IiwiX0dyYXBoUUxDb25maWciLCJjb25maWciLCJfQXVkaWVuY2UiLCJsYXN0VXNlZCIsInRpbWVzVXNlZCIsIl9JZGVtcG90ZW5jeSIsInJlcUlkIiwiZXhwaXJlIiwicmVxdWlyZWRDb2x1bW5zIiwicmVhZCIsIndyaXRlIiwiaW52YWxpZENvbHVtbnMiLCJzeXN0ZW1DbGFzc2VzIiwidm9sYXRpbGVDbGFzc2VzIiwicm9sZVJlZ2V4IiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4IiwicHVibGljUmVnZXgiLCJhdXRoZW50aWNhdGVkUmVnZXgiLCJyZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXgiLCJjbHBQb2ludGVyUmVnZXgiLCJwcm90ZWN0ZWRGaWVsZHNSZWdleCIsImNscEZpZWxkc1JlZ2V4IiwidmFsaWRhdGVQZXJtaXNzaW9uS2V5IiwidXNlcklkUmVnRXhwIiwibWF0Y2hlc1NvbWUiLCJyZWdFeCIsIm1hdGNoIiwidmFsaWQiLCJFcnJvciIsIklOVkFMSURfSlNPTiIsInZhbGlkYXRlUHJvdGVjdGVkRmllbGRzS2V5IiwiQ0xQVmFsaWRLZXlzIiwidmFsaWRhdGVDTFAiLCJwZXJtcyIsImZpZWxkcyIsIm9wZXJhdGlvbktleSIsImluZGV4T2YiLCJvcGVyYXRpb24iLCJ2YWxpZGF0ZUNMUGpzb24iLCJmaWVsZE5hbWUiLCJ2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uIiwiZW50aXR5IiwicHJvdGVjdGVkRmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwiZmllbGQiLCJwb2ludGVyRmllbGRzIiwicG9pbnRlckZpZWxkIiwicGVybWl0Iiwiam9pbkNsYXNzUmVnZXgiLCJjbGFzc0FuZEZpZWxkUmVnZXgiLCJjbGFzc05hbWVJc1ZhbGlkIiwidGVzdCIsImZpZWxkTmFtZUlzVmFsaWQiLCJpbmNsdWRlcyIsImZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyIsImludmFsaWRDbGFzc05hbWVNZXNzYWdlIiwiaW52YWxpZEpzb25FcnJvciIsInZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcyIsImZpZWxkVHlwZUlzSW52YWxpZCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsInVuZGVmaW5lZCIsIklOQ09SUkVDVF9UWVBFIiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsInNjaGVtYSIsImluamVjdERlZmF1bHRTY2hlbWEiLCJfcnBlcm0iLCJfd3Blcm0iLCJfaGFzaGVkX3Bhc3N3b3JkIiwiY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hIiwiX3JlZiIsImluZGV4ZXMiLCJTY2hlbWFEYXRhIiwiY29uc3RydWN0b3IiLCJhbGxTY2hlbWFzIiwiX19kYXRhIiwiX19wcm90ZWN0ZWRGaWVsZHMiLCJnZXQiLCJkYXRhIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiZGVlcGNvcHkiLCJjbGFzc1Byb3RlY3RlZEZpZWxkcyIsInVucSIsIlNldCIsImZyb20iLCJkZWZhdWx0U2NoZW1hIiwiX0hvb2tzU2NoZW1hIiwiX0dsb2JhbENvbmZpZ1NjaGVtYSIsIl9HcmFwaFFMQ29uZmlnU2NoZW1hIiwiX1B1c2hTdGF0dXNTY2hlbWEiLCJfSm9iU3RhdHVzU2NoZW1hIiwiX0pvYlNjaGVkdWxlU2NoZW1hIiwiX0F1ZGllbmNlU2NoZW1hIiwiX0lkZW1wb3RlbmN5U2NoZW1hIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsImRiVHlwZU1hdGNoZXNPYmplY3RUeXBlIiwiZGJUeXBlIiwib2JqZWN0VHlwZSIsInR5cGVUb1N0cmluZyIsInR0bCIsImRhdGUiLCJEYXRlIiwibm93IiwiZHVyYXRpb24iLCJTY2hlbWFDb250cm9sbGVyIiwiZGF0YWJhc2VBZGFwdGVyIiwiX2RiQWRhcHRlciIsIkNvbmZpZyIsImFwcGxpY2F0aW9uSWQiLCJzY2hlbWFEYXRhIiwiU2NoZW1hQ2FjaGUiLCJhbGwiLCJjdXN0b21JZHMiLCJhbGxvd0N1c3RvbU9iamVjdElkIiwiY3VzdG9tSWRSZWdFeCIsImF1dG9JZFJlZ0V4IiwidXNlcklkUmVnRXgiLCJ3YXRjaCIsInJlbG9hZERhdGEiLCJjbGVhckNhY2hlIiwicmVsb2FkRGF0YUlmTmVlZGVkIiwiZW5hYmxlU2NoZW1hSG9va3MiLCJvcHRpb25zIiwicmVsb2FkRGF0YVByb21pc2UiLCJnZXRBbGxDbGFzc2VzIiwidGhlbiIsImVyciIsInNldEFsbENsYXNzZXMiLCJjYWNoZWQiLCJQcm9taXNlIiwicmVzb2x2ZSIsIm1hcCIsInB1dCIsImdldE9uZVNjaGVtYSIsImFsbG93Vm9sYXRpbGVDbGFzc2VzIiwiY2xlYXIiLCJvbmVTY2hlbWEiLCJmaW5kIiwicmVqZWN0IiwiYWRkQ2xhc3NJZk5vdEV4aXN0cyIsInZhbGlkYXRpb25FcnJvciIsInZhbGlkYXRlTmV3Q2xhc3MiLCJjb2RlIiwiZXJyb3IiLCJhZGFwdGVyU2NoZW1hIiwiY3JlYXRlQ2xhc3MiLCJwYXJzZVNjaGVtYSIsIkRVUExJQ0FURV9WQUxVRSIsInVwZGF0ZUNsYXNzIiwic3VibWl0dGVkRmllbGRzIiwiZGF0YWJhc2UiLCJleGlzdGluZ0ZpZWxkcyIsIl9fb3AiLCJuZXdTY2hlbWEiLCJidWlsZE1lcmdlZFNjaGVtYU9iamVjdCIsImRlZmF1bHRGaWVsZHMiLCJmdWxsTmV3U2NoZW1hIiwidmFsaWRhdGVTY2hlbWFEYXRhIiwiZGVsZXRlZEZpZWxkcyIsImluc2VydGVkRmllbGRzIiwiZGVsZXRlUHJvbWlzZSIsImRlbGV0ZUZpZWxkcyIsImVuZm9yY2VGaWVsZHMiLCJwcm9taXNlcyIsImVuZm9yY2VGaWVsZEV4aXN0cyIsInJlc3VsdHMiLCJyZXN1bHQiLCJzZXRQZXJtaXNzaW9ucyIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0IiwiZW5zdXJlRmllbGRzIiwicmVsb2FkZWRTY2hlbWEiLCJjYXRjaCIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImV4aXN0aW5nRmllbGROYW1lcyIsIklOVkFMSURfS0VZX05BTUUiLCJmaWVsZFR5cGUiLCJkZWZhdWx0VmFsdWUiLCJkZWZhdWx0VmFsdWVUeXBlIiwiZ2V0VHlwZSIsInJlcXVpcmVkIiwiZ2VvUG9pbnRzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaXNWYWxpZGF0aW9uIiwibWFpbnRlbmFuY2UiLCJzcGxpdCIsImZpZWxkTmFtZVRvVmFsaWRhdGUiLCJjaGFyQXQiLCJzdWJzdHJpbmciLCJleHBlY3RlZFR5cGUiLCJnZXRFeHBlY3RlZFR5cGUiLCJKU09OIiwic3RyaW5naWZ5IiwidXBkYXRlRmllbGRPcHRpb25zIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsImRlbGV0ZUZpZWxkIiwiZmllbGROYW1lcyIsInNjaGVtYUZpZWxkcyIsImFkYXB0ZXIiLCJkZWxldGVDbGFzcyIsInZhbGlkYXRlT2JqZWN0Iiwib2JqZWN0IiwiZ2VvY291bnQiLCJleHBlY3RlZCIsInByb21pc2UiLCJ0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMiLCJ2YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyIsImNvbHVtbnMiLCJtaXNzaW5nQ29sdW1ucyIsImNvbHVtbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsImFjbEdyb3VwIiwidGVzdFBlcm1pc3Npb25zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiY2xhc3NQZXJtaXNzaW9ucyIsInNvbWUiLCJhY2wiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJhY3Rpb24iLCJPQkpFQ1RfTk9UX0ZPVU5EIiwicGVybWlzc2lvbkZpZWxkIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImhhc0NsYXNzIiwibG9hZCIsImRiQWRhcHRlciIsInNjaGVtYUNhY2hlVHRsIiwicHV0UmVxdWVzdCIsInN5c1NjaGVtYUZpZWxkIiwiX2lkIiwib2xkRmllbGQiLCJmaWVsZElzRGVsZXRlZCIsIm5ld0ZpZWxkIiwic2NoZW1hUHJvbWlzZSIsImdldE9iamVjdFR5cGUiLCJfX3R5cGUiLCJpc28iLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsImJhc2U2NCIsImNvb3JkaW5hdGVzIiwib2JqZWN0cyIsIm9wcyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG4vLyBUaGlzIGNsYXNzIGhhbmRsZXMgc2NoZW1hIHZhbGlkYXRpb24sIHBlcnNpc3RlbmNlLCBhbmQgbW9kaWZpY2F0aW9uLlxuLy9cbi8vIEVhY2ggaW5kaXZpZHVhbCBTY2hlbWEgb2JqZWN0IHNob3VsZCBiZSBpbW11dGFibGUuIFRoZSBoZWxwZXJzIHRvXG4vLyBkbyB0aGluZ3Mgd2l0aCB0aGUgU2NoZW1hIGp1c3QgcmV0dXJuIGEgbmV3IHNjaGVtYSB3aGVuIHRoZSBzY2hlbWFcbi8vIGlzIGNoYW5nZWQuXG4vL1xuLy8gVGhlIGNhbm9uaWNhbCBwbGFjZSB0byBzdG9yZSB0aGlzIFNjaGVtYSBpcyBpbiB0aGUgZGF0YWJhc2UgaXRzZWxmLFxuLy8gaW4gYSBfU0NIRU1BIGNvbGxlY3Rpb24uIFRoaXMgaXMgbm90IHRoZSByaWdodCB3YXkgdG8gZG8gaXQgZm9yIGFuXG4vLyBvcGVuIHNvdXJjZSBmcmFtZXdvcmssIGJ1dCBpdCdzIGJhY2t3YXJkIGNvbXBhdGlibGUsIHNvIHdlJ3JlXG4vLyBrZWVwaW5nIGl0IHRoaXMgd2F5IGZvciBub3cuXG4vL1xuLy8gSW4gQVBJLWhhbmRsaW5nIGNvZGUsIHlvdSBzaG91bGQgb25seSB1c2UgdGhlIFNjaGVtYSBjbGFzcyB2aWEgdGhlXG4vLyBEYXRhYmFzZUNvbnRyb2xsZXIuIFRoaXMgd2lsbCBsZXQgdXMgcmVwbGFjZSB0aGUgc2NoZW1hIGxvZ2ljIGZvclxuLy8gZGlmZmVyZW50IGRhdGFiYXNlcy5cbi8vIFRPRE86IGhpZGUgYWxsIHNjaGVtYSBsb2dpYyBpbnNpZGUgdGhlIGRhdGFiYXNlIGFkYXB0ZXIuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBTY2hlbWFDYWNoZSBmcm9tICcuLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4vRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCB0eXBlIHtcbiAgU2NoZW1hLFxuICBTY2hlbWFGaWVsZHMsXG4gIENsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgU2NoZW1hRmllbGQsXG4gIExvYWRTY2hlbWFPcHRpb25zLFxufSBmcm9tICcuL3R5cGVzJztcblxuY29uc3QgZGVmYXVsdENvbHVtbnM6IHsgW3N0cmluZ106IFNjaGVtYUZpZWxkcyB9ID0gT2JqZWN0LmZyZWV6ZSh7XG4gIC8vIENvbnRhaW4gdGhlIGRlZmF1bHQgY29sdW1ucyBmb3IgZXZlcnkgcGFyc2Ugb2JqZWN0IHR5cGUgKGV4Y2VwdCBfSm9pbiBjb2xsZWN0aW9uKVxuICBfRGVmYXVsdDoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY3JlYXRlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIHVwZGF0ZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICBBQ0w6IHsgdHlwZTogJ0FDTCcgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX1VzZXIgY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9Vc2VyOiB7XG4gICAgdXNlcm5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXNzd29yZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVtYWlsOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZW1haWxWZXJpZmllZDogeyB0eXBlOiAnQm9vbGVhbicgfSxcbiAgICBhdXRoRGF0YTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfSW5zdGFsbGF0aW9uIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfSW5zdGFsbGF0aW9uOiB7XG4gICAgaW5zdGFsbGF0aW9uSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkZXZpY2VUb2tlbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNoYW5uZWxzOiB7IHR5cGU6ICdBcnJheScgfSxcbiAgICBkZXZpY2VUeXBlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcHVzaFR5cGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBHQ01TZW5kZXJJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHRpbWVab25lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbG9jYWxlSWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGJhZGdlOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgYXBwVmVyc2lvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGFwcE5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBhcHBJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyc2VWZXJzaW9uOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9Sb2xlIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfUm9sZToge1xuICAgIG5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB1c2VyczogeyB0eXBlOiAnUmVsYXRpb24nLCB0YXJnZXRDbGFzczogJ19Vc2VyJyB9LFxuICAgIHJvbGVzOiB7IHR5cGU6ICdSZWxhdGlvbicsIHRhcmdldENsYXNzOiAnX1JvbGUnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9TZXNzaW9uIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfU2Vzc2lvbjoge1xuICAgIHVzZXI6IHsgdHlwZTogJ1BvaW50ZXInLCB0YXJnZXRDbGFzczogJ19Vc2VyJyB9LFxuICAgIGluc3RhbGxhdGlvbklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc2Vzc2lvblRva2VuOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXhwaXJlc0F0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIGNyZWF0ZWRXaXRoOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9Qcm9kdWN0OiB7XG4gICAgcHJvZHVjdElkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkb3dubG9hZDogeyB0eXBlOiAnRmlsZScgfSxcbiAgICBkb3dubG9hZE5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBpY29uOiB7IHR5cGU6ICdGaWxlJyB9LFxuICAgIG9yZGVyOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgdGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdWJ0aXRsZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICBfUHVzaFN0YXR1czoge1xuICAgIHB1c2hUaW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc291cmNlOiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHJlc3Qgb3Igd2VidWlcbiAgICBxdWVyeTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyB0aGUgc3RyaW5naWZpZWQgSlNPTiBxdWVyeVxuICAgIHBheWxvYWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gdGhlIHN0cmluZ2lmaWVkIEpTT04gcGF5bG9hZCxcbiAgICB0aXRsZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyeTogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIGV4cGlyYXRpb25faW50ZXJ2YWw6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBzdGF0dXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBudW1TZW50OiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgbnVtRmFpbGVkOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgcHVzaEhhc2g6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlcnJvck1lc3NhZ2U6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBzZW50UGVyVHlwZTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGZhaWxlZFBlclR5cGU6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBzZW50UGVyVVRDT2Zmc2V0OiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgZmFpbGVkUGVyVVRDT2Zmc2V0OiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgY291bnQ6IHsgdHlwZTogJ051bWJlcicgfSwgLy8gdHJhY2tzICMgb2YgYmF0Y2hlcyBxdWV1ZWQgYW5kIHBlbmRpbmdcbiAgfSxcbiAgX0pvYlN0YXR1czoge1xuICAgIGpvYk5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzb3VyY2U6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdGF0dXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBtZXNzYWdlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdPYmplY3QnIH0sIC8vIHBhcmFtcyByZWNlaXZlZCB3aGVuIGNhbGxpbmcgdGhlIGpvYlxuICAgIGZpbmlzaGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gIH0sXG4gIF9Kb2JTY2hlZHVsZToge1xuICAgIGpvYk5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkZXNjcmlwdGlvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHN0YXJ0QWZ0ZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkYXlzT2ZXZWVrOiB7IHR5cGU6ICdBcnJheScgfSxcbiAgICB0aW1lT2ZEYXk6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBsYXN0UnVuOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgcmVwZWF0TWludXRlczogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICB9LFxuICBfSG9va3M6IHtcbiAgICBmdW5jdGlvbk5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjbGFzc05hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB0cmlnZ2VyTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHVybDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICBfR2xvYmFsQ29uZmlnOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBtYXN0ZXJLZXlPbmx5OiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9HcmFwaFFMQ29uZmlnOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjb25maWc6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgX0F1ZGllbmNlOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcXVlcnk6IHsgdHlwZTogJ1N0cmluZycgfSwgLy9zdG9yaW5nIHF1ZXJ5IGFzIEpTT04gc3RyaW5nIHRvIHByZXZlbnQgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiIGVycm9yXG4gICAgbGFzdFVzZWQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgdGltZXNVc2VkOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gIH0sXG4gIF9JZGVtcG90ZW5jeToge1xuICAgIHJlcUlkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXhwaXJlOiB7IHR5cGU6ICdEYXRlJyB9LFxuICB9LFxufSk7XG5cbi8vIGZpZWxkcyByZXF1aXJlZCBmb3IgcmVhZCBvciB3cml0ZSBvcGVyYXRpb25zIG9uIHRoZWlyIHJlc3BlY3RpdmUgY2xhc3Nlcy5cbmNvbnN0IHJlcXVpcmVkQ29sdW1ucyA9IE9iamVjdC5mcmVlemUoe1xuICByZWFkOiB7XG4gICAgX1VzZXI6IFsndXNlcm5hbWUnXSxcbiAgfSxcbiAgd3JpdGU6IHtcbiAgICBfUHJvZHVjdDogWydwcm9kdWN0SWRlbnRpZmllcicsICdpY29uJywgJ29yZGVyJywgJ3RpdGxlJywgJ3N1YnRpdGxlJ10sXG4gICAgX1JvbGU6IFsnbmFtZScsICdBQ0wnXSxcbiAgfSxcbn0pO1xuXG5jb25zdCBpbnZhbGlkQ29sdW1ucyA9IFsnbGVuZ3RoJ107XG5cbmNvbnN0IHN5c3RlbUNsYXNzZXMgPSBPYmplY3QuZnJlZXplKFtcbiAgJ19Vc2VyJyxcbiAgJ19JbnN0YWxsYXRpb24nLFxuICAnX1JvbGUnLFxuICAnX1Nlc3Npb24nLFxuICAnX1Byb2R1Y3QnLFxuICAnX1B1c2hTdGF0dXMnLFxuICAnX0pvYlN0YXR1cycsXG4gICdfSm9iU2NoZWR1bGUnLFxuICAnX0F1ZGllbmNlJyxcbiAgJ19JZGVtcG90ZW5jeScsXG5dKTtcblxuY29uc3Qgdm9sYXRpbGVDbGFzc2VzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdfSm9iU3RhdHVzJyxcbiAgJ19QdXNoU3RhdHVzJyxcbiAgJ19Ib29rcycsXG4gICdfR2xvYmFsQ29uZmlnJyxcbiAgJ19HcmFwaFFMQ29uZmlnJyxcbiAgJ19Kb2JTY2hlZHVsZScsXG4gICdfQXVkaWVuY2UnLFxuICAnX0lkZW1wb3RlbmN5Jyxcbl0pO1xuXG4vLyBBbnl0aGluZyB0aGF0IHN0YXJ0IHdpdGggcm9sZVxuY29uc3Qgcm9sZVJlZ2V4ID0gL15yb2xlOi4qLztcbi8vIEFueXRoaW5nIHRoYXQgc3RhcnRzIHdpdGggdXNlckZpZWxkIChhbGxvd2VkIGZvciBwcm90ZWN0ZWQgZmllbGRzIG9ubHkpXG5jb25zdCBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUmVnZXggPSAvXnVzZXJGaWVsZDouKi87XG4vLyAqIHBlcm1pc3Npb25cbmNvbnN0IHB1YmxpY1JlZ2V4ID0gL15cXCokLztcblxuY29uc3QgYXV0aGVudGljYXRlZFJlZ2V4ID0gL15hdXRoZW50aWNhdGVkJC87XG5cbmNvbnN0IHJlcXVpcmVzQXV0aGVudGljYXRpb25SZWdleCA9IC9ecmVxdWlyZXNBdXRoZW50aWNhdGlvbiQvO1xuXG5jb25zdCBjbHBQb2ludGVyUmVnZXggPSAvXnBvaW50ZXJGaWVsZHMkLztcblxuLy8gcmVnZXggZm9yIHZhbGlkYXRpbmcgZW50aXRpZXMgaW4gcHJvdGVjdGVkRmllbGRzIG9iamVjdFxuY29uc3QgcHJvdGVjdGVkRmllbGRzUmVnZXggPSBPYmplY3QuZnJlZXplKFtcbiAgcHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4LFxuICBwdWJsaWNSZWdleCxcbiAgYXV0aGVudGljYXRlZFJlZ2V4LFxuICByb2xlUmVnZXgsXG5dKTtcblxuLy8gY2xwIHJlZ2V4XG5jb25zdCBjbHBGaWVsZHNSZWdleCA9IE9iamVjdC5mcmVlemUoW1xuICBjbHBQb2ludGVyUmVnZXgsXG4gIHB1YmxpY1JlZ2V4LFxuICByZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXgsXG4gIHJvbGVSZWdleCxcbl0pO1xuXG5mdW5jdGlvbiB2YWxpZGF0ZVBlcm1pc3Npb25LZXkoa2V5LCB1c2VySWRSZWdFeHApIHtcbiAgbGV0IG1hdGNoZXNTb21lID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcmVnRXggb2YgY2xwRmllbGRzUmVnZXgpIHtcbiAgICBpZiAoa2V5Lm1hdGNoKHJlZ0V4KSAhPT0gbnVsbCkge1xuICAgICAgbWF0Y2hlc1NvbWUgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLy8gdXNlcklkIGRlcGVuZHMgb24gc3RhcnR1cCBvcHRpb25zIHNvIGl0J3MgZHluYW1pY1xuICBjb25zdCB2YWxpZCA9IG1hdGNoZXNTb21lIHx8IGtleS5tYXRjaCh1c2VySWRSZWdFeHApICE9PSBudWxsO1xuICBpZiAoIXZhbGlkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYCcke2tleX0nIGlzIG5vdCBhIHZhbGlkIGtleSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnNgXG4gICAgKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVByb3RlY3RlZEZpZWxkc0tleShrZXksIHVzZXJJZFJlZ0V4cCkge1xuICBsZXQgbWF0Y2hlc1NvbWUgPSBmYWxzZTtcbiAgZm9yIChjb25zdCByZWdFeCBvZiBwcm90ZWN0ZWRGaWVsZHNSZWdleCkge1xuICAgIGlmIChrZXkubWF0Y2gocmVnRXgpICE9PSBudWxsKSB7XG4gICAgICBtYXRjaGVzU29tZSA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICAvLyB1c2VySWQgcmVnZXggZGVwZW5kcyBvbiBsYXVuY2ggb3B0aW9ucyBzbyBpdCdzIGR5bmFtaWNcbiAgY29uc3QgdmFsaWQgPSBtYXRjaGVzU29tZSB8fCBrZXkubWF0Y2godXNlcklkUmVnRXhwKSAhPT0gbnVsbDtcbiAgaWYgKCF2YWxpZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtrZXl9JyBpcyBub3QgYSB2YWxpZCBrZXkgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICk7XG4gIH1cbn1cblxuY29uc3QgQ0xQVmFsaWRLZXlzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdmaW5kJyxcbiAgJ2NvdW50JyxcbiAgJ2dldCcsXG4gICdjcmVhdGUnLFxuICAndXBkYXRlJyxcbiAgJ2RlbGV0ZScsXG4gICdhZGRGaWVsZCcsXG4gICdyZWFkVXNlckZpZWxkcycsXG4gICd3cml0ZVVzZXJGaWVsZHMnLFxuICAncHJvdGVjdGVkRmllbGRzJyxcbl0pO1xuXG4vLyB2YWxpZGF0aW9uIGJlZm9yZSBzZXR0aW5nIGNsYXNzLWxldmVsIHBlcm1pc3Npb25zIG9uIGNvbGxlY3Rpb25cbmZ1bmN0aW9uIHZhbGlkYXRlQ0xQKHBlcm1zOiBDbGFzc0xldmVsUGVybWlzc2lvbnMsIGZpZWxkczogU2NoZW1hRmllbGRzLCB1c2VySWRSZWdFeHA6IFJlZ0V4cCkge1xuICBpZiAoIXBlcm1zKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGZvciAoY29uc3Qgb3BlcmF0aW9uS2V5IGluIHBlcm1zKSB7XG4gICAgaWYgKENMUFZhbGlkS2V5cy5pbmRleE9mKG9wZXJhdGlvbktleSkgPT0gLTEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJHtvcGVyYXRpb25LZXl9IGlzIG5vdCBhIHZhbGlkIG9wZXJhdGlvbiBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnNgXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IG9wZXJhdGlvbiA9IHBlcm1zW29wZXJhdGlvbktleV07XG4gICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG5cbiAgICAvLyB0aHJvd3Mgd2hlbiByb290IGZpZWxkcyBhcmUgb2Ygd3JvbmcgdHlwZVxuICAgIHZhbGlkYXRlQ0xQanNvbihvcGVyYXRpb24sIG9wZXJhdGlvbktleSk7XG5cbiAgICBpZiAob3BlcmF0aW9uS2V5ID09PSAncmVhZFVzZXJGaWVsZHMnIHx8IG9wZXJhdGlvbktleSA9PT0gJ3dyaXRlVXNlckZpZWxkcycpIHtcbiAgICAgIC8vIHZhbGlkYXRlIGdyb3VwZWQgcG9pbnRlciBwZXJtaXNzaW9uc1xuICAgICAgLy8gbXVzdCBiZSBhbiBhcnJheSB3aXRoIGZpZWxkIG5hbWVzXG4gICAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBvZiBvcGVyYXRpb24pIHtcbiAgICAgICAgdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihmaWVsZE5hbWUsIGZpZWxkcywgb3BlcmF0aW9uS2V5KTtcbiAgICAgIH1cbiAgICAgIC8vIHJlYWRVc2VyRmllbGRzIGFuZCB3cml0ZXJVc2VyRmllbGRzIGRvIG5vdCBoYXZlIG5lc2R0ZWQgZmllbGRzXG4gICAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBvcGVyYXRpb25LZXlcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIHZhbGlkYXRlIHByb3RlY3RlZCBmaWVsZHNcbiAgICBpZiAob3BlcmF0aW9uS2V5ID09PSAncHJvdGVjdGVkRmllbGRzJykge1xuICAgICAgZm9yIChjb25zdCBlbnRpdHkgaW4gb3BlcmF0aW9uKSB7XG4gICAgICAgIC8vIHRocm93cyBvbiB1bmV4cGVjdGVkIGtleVxuICAgICAgICB2YWxpZGF0ZVByb3RlY3RlZEZpZWxkc0tleShlbnRpdHksIHVzZXJJZFJlZ0V4cCk7XG5cbiAgICAgICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHByb3RlY3RlZEZpZWxkcykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgJyR7cHJvdGVjdGVkRmllbGRzfScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIHByb3RlY3RlZEZpZWxkc1ske2VudGl0eX1dIC0gZXhwZWN0ZWQgYW4gYXJyYXkuYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpZiB0aGUgZmllbGQgaXMgaW4gZm9ybSBvZiBhcnJheVxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgIC8vIGRvIG5vdCBhbGxvb3cgdG8gcHJvdGVjdCBkZWZhdWx0IGZpZWxkc1xuICAgICAgICAgIGlmIChkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZF0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBgRGVmYXVsdCBmaWVsZCAnJHtmaWVsZH0nIGNhbiBub3QgYmUgcHJvdGVjdGVkYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gZmllbGQgc2hvdWxkIGV4aXN0IG9uIGNvbGxlY3Rpb25cbiAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZHMsIGZpZWxkKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgIGBGaWVsZCAnJHtmaWVsZH0nIGluIHByb3RlY3RlZEZpZWxkczoke2VudGl0eX0gZG9lcyBub3QgZXhpc3RgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyB2YWxpZGF0ZSBvdGhlciBmaWVsZHNcbiAgICAvLyBFbnRpdHkgY2FuIGJlOlxuICAgIC8vIFwiKlwiIC0gUHVibGljLFxuICAgIC8vIFwicmVxdWlyZXNBdXRoZW50aWNhdGlvblwiIC0gYXV0aGVudGljYXRlZCB1c2VycyxcbiAgICAvLyBcIm9iamVjdElkXCIgLSBfVXNlciBpZCxcbiAgICAvLyBcInJvbGU6cm9sZW5hbWVcIixcbiAgICAvLyBcInBvaW50ZXJGaWVsZHNcIiAtIGFycmF5IG9mIGZpZWxkIG5hbWVzIGNvbnRhaW5pbmcgcG9pbnRlcnMgdG8gdXNlcnNcbiAgICBmb3IgKGNvbnN0IGVudGl0eSBpbiBvcGVyYXRpb24pIHtcbiAgICAgIC8vIHRocm93cyBvbiB1bmV4cGVjdGVkIGtleVxuICAgICAgdmFsaWRhdGVQZXJtaXNzaW9uS2V5KGVudGl0eSwgdXNlcklkUmVnRXhwKTtcblxuICAgICAgLy8gZW50aXR5IGNhbiBiZSBlaXRoZXI6XG4gICAgICAvLyBcInBvaW50ZXJGaWVsZHNcIjogc3RyaW5nW11cbiAgICAgIGlmIChlbnRpdHkgPT09ICdwb2ludGVyRmllbGRzJykge1xuICAgICAgICBjb25zdCBwb2ludGVyRmllbGRzID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocG9pbnRlckZpZWxkcykpIHtcbiAgICAgICAgICBmb3IgKGNvbnN0IHBvaW50ZXJGaWVsZCBvZiBwb2ludGVyRmllbGRzKSB7XG4gICAgICAgICAgICB2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uKHBvaW50ZXJGaWVsZCwgZmllbGRzLCBvcGVyYXRpb24pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgJyR7cG9pbnRlckZpZWxkc30nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciAke29wZXJhdGlvbktleX1bJHtlbnRpdHl9XSAtIGV4cGVjdGVkIGFuIGFycmF5LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IGVudGl0eSBrZXlcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIG9yIFtlbnRpdHldOiBib29sZWFuXG4gICAgICBjb25zdCBwZXJtaXQgPSBvcGVyYXRpb25bZW50aXR5XTtcblxuICAgICAgaWYgKHBlcm1pdCAhPT0gdHJ1ZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGAnJHtwZXJtaXR9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnMgJHtvcGVyYXRpb25LZXl9OiR7ZW50aXR5fToke3Blcm1pdH1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ0xQanNvbihvcGVyYXRpb246IGFueSwgb3BlcmF0aW9uS2V5OiBzdHJpbmcpIHtcbiAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3JlYWRVc2VyRmllbGRzJyB8fCBvcGVyYXRpb25LZXkgPT09ICd3cml0ZVVzZXJGaWVsZHMnKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG9wZXJhdGlvbikpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJyR7b3BlcmF0aW9ufScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fSAtIG11c3QgYmUgYW4gYXJyYXlgXG4gICAgICApO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAodHlwZW9mIG9wZXJhdGlvbiA9PT0gJ29iamVjdCcgJiYgb3BlcmF0aW9uICE9PSBudWxsKSB7XG4gICAgICAvLyBvayB0byBwcm9jZWVkXG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJyR7b3BlcmF0aW9ufScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fSAtIG11c3QgYmUgYW4gb2JqZWN0YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihmaWVsZE5hbWU6IHN0cmluZywgZmllbGRzOiBPYmplY3QsIG9wZXJhdGlvbjogc3RyaW5nKSB7XG4gIC8vIFVzZXMgY29sbGVjdGlvbiBzY2hlbWEgdG8gZW5zdXJlIHRoZSBmaWVsZCBpcyBvZiB0eXBlOlxuICAvLyAtIFBvaW50ZXI8X1VzZXI+IChwb2ludGVycylcbiAgLy8gLSBBcnJheVxuICAvL1xuICAvLyAgICBJdCdzIG5vdCBwb3NzaWJsZSB0byBlbmZvcmNlIHR5cGUgb24gQXJyYXkncyBpdGVtcyBpbiBzY2hlbWFcbiAgLy8gIHNvIHdlIGFjY2VwdCBhbnkgQXJyYXkgZmllbGQsIGFuZCBsYXRlciB3aGVuIGFwcGx5aW5nIHBlcm1pc3Npb25zXG4gIC8vICBvbmx5IGl0ZW1zIHRoYXQgYXJlIHBvaW50ZXJzIHRvIF9Vc2VyIGFyZSBjb25zaWRlcmVkLlxuICBpZiAoXG4gICAgIShcbiAgICAgIGZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAoKGZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ1BvaW50ZXInICYmIGZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzID09ICdfVXNlcicpIHx8XG4gICAgICAgIGZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ0FycmF5JylcbiAgICApXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtmaWVsZE5hbWV9JyBpcyBub3QgYSB2YWxpZCBjb2x1bW4gZm9yIGNsYXNzIGxldmVsIHBvaW50ZXIgcGVybWlzc2lvbnMgJHtvcGVyYXRpb259YFxuICAgICk7XG4gIH1cbn1cblxuY29uc3Qgam9pbkNsYXNzUmVnZXggPSAvXl9Kb2luOltBLVphLXowLTlfXSs6W0EtWmEtejAtOV9dKy87XG5jb25zdCBjbGFzc0FuZEZpZWxkUmVnZXggPSAvXltBLVphLXpdW0EtWmEtejAtOV9dKiQvO1xuZnVuY3Rpb24gY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAvLyBWYWxpZCBjbGFzc2VzIG11c3Q6XG4gIHJldHVybiAoXG4gICAgLy8gQmUgb25lIG9mIF9Vc2VyLCBfSW5zdGFsbGF0aW9uLCBfUm9sZSwgX1Nlc3Npb24gT1JcbiAgICBzeXN0ZW1DbGFzc2VzLmluZGV4T2YoY2xhc3NOYW1lKSA+IC0xIHx8XG4gICAgLy8gQmUgYSBqb2luIHRhYmxlIE9SXG4gICAgam9pbkNsYXNzUmVnZXgudGVzdChjbGFzc05hbWUpIHx8XG4gICAgLy8gSW5jbHVkZSBvbmx5IGFscGhhLW51bWVyaWMgYW5kIHVuZGVyc2NvcmVzLCBhbmQgbm90IHN0YXJ0IHdpdGggYW4gdW5kZXJzY29yZSBvciBudW1iZXJcbiAgICBmaWVsZE5hbWVJc1ZhbGlkKGNsYXNzTmFtZSwgY2xhc3NOYW1lKVxuICApO1xufVxuXG4vLyBWYWxpZCBmaWVsZHMgbXVzdCBiZSBhbHBoYS1udW1lcmljLCBhbmQgbm90IHN0YXJ0IHdpdGggYW4gdW5kZXJzY29yZSBvciBudW1iZXJcbi8vIG11c3Qgbm90IGJlIGEgcmVzZXJ2ZWQga2V5XG5mdW5jdGlvbiBmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZTogc3RyaW5nLCBjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoY2xhc3NOYW1lICYmIGNsYXNzTmFtZSAhPT0gJ19Ib29rcycpIHtcbiAgICBpZiAoZmllbGROYW1lID09PSAnY2xhc3NOYW1lJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY2xhc3NBbmRGaWVsZFJlZ2V4LnRlc3QoZmllbGROYW1lKSAmJiAhaW52YWxpZENvbHVtbnMuaW5jbHVkZXMoZmllbGROYW1lKTtcbn1cblxuLy8gQ2hlY2tzIHRoYXQgaXQncyBub3QgdHJ5aW5nIHRvIGNsb2JiZXIgb25lIG9mIHRoZSBkZWZhdWx0IGZpZWxkcyBvZiB0aGUgY2xhc3MuXG5mdW5jdGlvbiBmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0W2ZpZWxkTmFtZV0pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gJiYgZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiAoXG4gICAgJ0ludmFsaWQgY2xhc3NuYW1lOiAnICtcbiAgICBjbGFzc05hbWUgK1xuICAgICcsIGNsYXNzbmFtZXMgY2FuIG9ubHkgaGF2ZSBhbHBoYW51bWVyaWMgY2hhcmFjdGVycyBhbmQgXywgYW5kIG11c3Qgc3RhcnQgd2l0aCBhbiBhbHBoYSBjaGFyYWN0ZXIgJ1xuICApO1xufVxuXG5jb25zdCBpbnZhbGlkSnNvbkVycm9yID0gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2ludmFsaWQgSlNPTicpO1xuY29uc3QgdmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzID0gW1xuICAnTnVtYmVyJyxcbiAgJ1N0cmluZycsXG4gICdCb29sZWFuJyxcbiAgJ0RhdGUnLFxuICAnT2JqZWN0JyxcbiAgJ0FycmF5JyxcbiAgJ0dlb1BvaW50JyxcbiAgJ0ZpbGUnLFxuICAnQnl0ZXMnLFxuICAnUG9seWdvbicsXG5dO1xuLy8gUmV0dXJucyBhbiBlcnJvciBzdWl0YWJsZSBmb3IgdGhyb3dpbmcgaWYgdGhlIHR5cGUgaXMgaW52YWxpZFxuY29uc3QgZmllbGRUeXBlSXNJbnZhbGlkID0gKHsgdHlwZSwgdGFyZ2V0Q2xhc3MgfSkgPT4ge1xuICBpZiAoWydQb2ludGVyJywgJ1JlbGF0aW9uJ10uaW5kZXhPZih0eXBlKSA+PSAwKSB7XG4gICAgaWYgKCF0YXJnZXRDbGFzcykge1xuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcigxMzUsIGB0eXBlICR7dHlwZX0gbmVlZHMgYSBjbGFzcyBuYW1lYCk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdGFyZ2V0Q2xhc3MgIT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gaW52YWxpZEpzb25FcnJvcjtcbiAgICB9IGVsc2UgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKHRhcmdldENsYXNzKSkge1xuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGludmFsaWRDbGFzc05hbWVNZXNzYWdlKHRhcmdldENsYXNzKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2YgdHlwZSAhPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gaW52YWxpZEpzb25FcnJvcjtcbiAgfVxuICBpZiAodmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzLmluZGV4T2YodHlwZSkgPCAwKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgYGludmFsaWQgZmllbGQgdHlwZTogJHt0eXBlfWApO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5jb25zdCBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hID0gKHNjaGVtYTogYW55KSA9PiB7XG4gIHNjaGVtYSA9IGluamVjdERlZmF1bHRTY2hlbWEoc2NoZW1hKTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuQUNMO1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMucGFzc3dvcmQ7XG4gICAgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYSA9ICh7IC4uLnNjaGVtYSB9KSA9PiB7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuXG4gIHNjaGVtYS5maWVsZHMuQUNMID0geyB0eXBlOiAnQUNMJyB9O1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuYXV0aERhdGE7IC8vQXV0aCBkYXRhIGlzIGltcGxpY2l0XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZDtcbiAgICBzY2hlbWEuZmllbGRzLnBhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICB9XG5cbiAgaWYgKHNjaGVtYS5pbmRleGVzICYmIE9iamVjdC5rZXlzKHNjaGVtYS5pbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICBkZWxldGUgc2NoZW1hLmluZGV4ZXM7XG4gIH1cblxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuY2xhc3MgU2NoZW1hRGF0YSB7XG4gIF9fZGF0YTogYW55O1xuICBfX3Byb3RlY3RlZEZpZWxkczogYW55O1xuICBjb25zdHJ1Y3RvcihhbGxTY2hlbWFzID0gW10sIHByb3RlY3RlZEZpZWxkcyA9IHt9KSB7XG4gICAgdGhpcy5fX2RhdGEgPSB7fTtcbiAgICB0aGlzLl9fcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzO1xuICAgIGFsbFNjaGVtYXMuZm9yRWFjaChzY2hlbWEgPT4ge1xuICAgICAgaWYgKHZvbGF0aWxlQ2xhc3Nlcy5pbmNsdWRlcyhzY2hlbWEuY2xhc3NOYW1lKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgc2NoZW1hLmNsYXNzTmFtZSwge1xuICAgICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdKSB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0ge307XG4gICAgICAgICAgICBkYXRhLmZpZWxkcyA9IGluamVjdERlZmF1bHRTY2hlbWEoc2NoZW1hKS5maWVsZHM7XG4gICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IGRlZXBjb3B5KHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMpO1xuICAgICAgICAgICAgZGF0YS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG5cbiAgICAgICAgICAgIGNvbnN0IGNsYXNzUHJvdGVjdGVkRmllbGRzID0gdGhpcy5fX3Byb3RlY3RlZEZpZWxkc1tzY2hlbWEuY2xhc3NOYW1lXTtcbiAgICAgICAgICAgIGlmIChjbGFzc1Byb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBjbGFzc1Byb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHVucSA9IG5ldyBTZXQoW1xuICAgICAgICAgICAgICAgICAgLi4uKGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLnByb3RlY3RlZEZpZWxkc1trZXldIHx8IFtdKSxcbiAgICAgICAgICAgICAgICAgIC4uLmNsYXNzUHJvdGVjdGVkRmllbGRzW2tleV0sXG4gICAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMucHJvdGVjdGVkRmllbGRzW2tleV0gPSBBcnJheS5mcm9tKHVucSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV0gPSBkYXRhO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV07XG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIEluamVjdCB0aGUgaW4tbWVtb3J5IGNsYXNzZXNcbiAgICB2b2xhdGlsZUNsYXNzZXMuZm9yRWFjaChjbGFzc05hbWUgPT4ge1xuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIGNsYXNzTmFtZSwge1xuICAgICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuX19kYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIGNvbnN0IHNjaGVtYSA9IGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGZpZWxkczoge30sXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB7fTtcbiAgICAgICAgICAgIGRhdGEuZmllbGRzID0gc2NoZW1hLmZpZWxkcztcbiAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICAgICAgICAgIGRhdGEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgICAgICAgdGhpcy5fX2RhdGFbY2xhc3NOYW1lXSA9IGRhdGE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9fZGF0YVtjbGFzc05hbWVdO1xuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbn1cblxuY29uc3QgaW5qZWN0RGVmYXVsdFNjaGVtYSA9ICh7IGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMsIGluZGV4ZXMgfTogU2NoZW1hKSA9PiB7XG4gIGNvbnN0IGRlZmF1bHRTY2hlbWE6IFNjaGVtYSA9IHtcbiAgICBjbGFzc05hbWUsXG4gICAgZmllbGRzOiB7XG4gICAgICAuLi5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgIC4uLihkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdIHx8IHt9KSxcbiAgICAgIC4uLmZpZWxkcyxcbiAgICB9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgfTtcbiAgaWYgKGluZGV4ZXMgJiYgT2JqZWN0LmtleXMoaW5kZXhlcykubGVuZ3RoICE9PSAwKSB7XG4gICAgZGVmYXVsdFNjaGVtYS5pbmRleGVzID0gaW5kZXhlcztcbiAgfVxuICByZXR1cm4gZGVmYXVsdFNjaGVtYTtcbn07XG5cbmNvbnN0IF9Ib29rc1NjaGVtYSA9IHsgY2xhc3NOYW1lOiAnX0hvb2tzJywgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fSG9va3MgfTtcbmNvbnN0IF9HbG9iYWxDb25maWdTY2hlbWEgPSB7XG4gIGNsYXNzTmFtZTogJ19HbG9iYWxDb25maWcnLFxuICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9HbG9iYWxDb25maWcsXG59O1xuY29uc3QgX0dyYXBoUUxDb25maWdTY2hlbWEgPSB7XG4gIGNsYXNzTmFtZTogJ19HcmFwaFFMQ29uZmlnJyxcbiAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fR3JhcGhRTENvbmZpZyxcbn07XG5jb25zdCBfUHVzaFN0YXR1c1NjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19QdXNoU3RhdHVzJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0pvYlN0YXR1c1NjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19Kb2JTdGF0dXMnLFxuICAgIGZpZWxkczoge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfSm9iU2NoZWR1bGVTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfSm9iU2NoZWR1bGUnLFxuICAgIGZpZWxkczoge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfQXVkaWVuY2VTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfQXVkaWVuY2UnLFxuICAgIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0F1ZGllbmNlLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0lkZW1wb3RlbmN5U2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0lkZW1wb3RlbmN5JyxcbiAgICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9JZGVtcG90ZW5jeSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgPSBbXG4gIF9Ib29rc1NjaGVtYSxcbiAgX0pvYlN0YXR1c1NjaGVtYSxcbiAgX0pvYlNjaGVkdWxlU2NoZW1hLFxuICBfUHVzaFN0YXR1c1NjaGVtYSxcbiAgX0dsb2JhbENvbmZpZ1NjaGVtYSxcbiAgX0dyYXBoUUxDb25maWdTY2hlbWEsXG4gIF9BdWRpZW5jZVNjaGVtYSxcbiAgX0lkZW1wb3RlbmN5U2NoZW1hLFxuXTtcblxuY29uc3QgZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUgPSAoZGJUeXBlOiBTY2hlbWFGaWVsZCB8IHN0cmluZywgb2JqZWN0VHlwZTogU2NoZW1hRmllbGQpID0+IHtcbiAgaWYgKGRiVHlwZS50eXBlICE9PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiBmYWxzZTtcbiAgaWYgKGRiVHlwZS50YXJnZXRDbGFzcyAhPT0gb2JqZWN0VHlwZS50YXJnZXRDbGFzcykgcmV0dXJuIGZhbHNlO1xuICBpZiAoZGJUeXBlID09PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiB0cnVlO1xuICBpZiAoZGJUeXBlLnR5cGUgPT09IG9iamVjdFR5cGUudHlwZSkgcmV0dXJuIHRydWU7XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbmNvbnN0IHR5cGVUb1N0cmluZyA9ICh0eXBlOiBTY2hlbWFGaWVsZCB8IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdHlwZTtcbiAgfVxuICBpZiAodHlwZS50YXJnZXRDbGFzcykge1xuICAgIHJldHVybiBgJHt0eXBlLnR5cGV9PCR7dHlwZS50YXJnZXRDbGFzc30+YDtcbiAgfVxuICByZXR1cm4gYCR7dHlwZS50eXBlfWA7XG59O1xuY29uc3QgdHRsID0ge1xuICBkYXRlOiBEYXRlLm5vdygpLFxuICBkdXJhdGlvbjogdW5kZWZpbmVkLFxufTtcblxuLy8gU3RvcmVzIHRoZSBlbnRpcmUgc2NoZW1hIG9mIHRoZSBhcHAgaW4gYSB3ZWlyZCBoeWJyaWQgZm9ybWF0IHNvbWV3aGVyZSBiZXR3ZWVuXG4vLyB0aGUgbW9uZ28gZm9ybWF0IGFuZCB0aGUgUGFyc2UgZm9ybWF0LiBTb29uLCB0aGlzIHdpbGwgYWxsIGJlIFBhcnNlIGZvcm1hdC5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFNjaGVtYUNvbnRyb2xsZXIge1xuICBfZGJBZGFwdGVyOiBTdG9yYWdlQWRhcHRlcjtcbiAgc2NoZW1hRGF0YTogeyBbc3RyaW5nXTogU2NoZW1hIH07XG4gIHJlbG9hZERhdGFQcm9taXNlOiA/UHJvbWlzZTxhbnk+O1xuICBwcm90ZWN0ZWRGaWVsZHM6IGFueTtcbiAgdXNlcklkUmVnRXg6IFJlZ0V4cDtcblxuICBjb25zdHJ1Y3RvcihkYXRhYmFzZUFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyKSB7XG4gICAgdGhpcy5fZGJBZGFwdGVyID0gZGF0YWJhc2VBZGFwdGVyO1xuICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoU2NoZW1hQ2FjaGUuYWxsKCksIHRoaXMucHJvdGVjdGVkRmllbGRzKTtcbiAgICB0aGlzLnByb3RlY3RlZEZpZWxkcyA9IGNvbmZpZy5wcm90ZWN0ZWRGaWVsZHM7XG5cbiAgICBjb25zdCBjdXN0b21JZHMgPSBjb25maWcuYWxsb3dDdXN0b21PYmplY3RJZDtcblxuICAgIGNvbnN0IGN1c3RvbUlkUmVnRXggPSAvXi57MSx9JC91OyAvLyAxKyBjaGFyc1xuICAgIGNvbnN0IGF1dG9JZFJlZ0V4ID0gL15bYS16QS1aMC05XXsxLH0kLztcblxuICAgIHRoaXMudXNlcklkUmVnRXggPSBjdXN0b21JZHMgPyBjdXN0b21JZFJlZ0V4IDogYXV0b0lkUmVnRXg7XG5cbiAgICB0aGlzLl9kYkFkYXB0ZXIud2F0Y2goKCkgPT4ge1xuICAgICAgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHJlbG9hZERhdGFJZk5lZWRlZCgpIHtcbiAgICBpZiAodGhpcy5fZGJBZGFwdGVyLmVuYWJsZVNjaGVtYUhvb2tzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHsgZGF0ZSwgZHVyYXRpb24gfSA9IHR0bCB8fCB7fTtcbiAgICBpZiAoIWR1cmF0aW9uKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgaWYgKG5vdyAtIGRhdGUgPiBkdXJhdGlvbikge1xuICAgICAgdHRsLmRhdGUgPSBub3c7XG4gICAgICBhd2FpdCB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJlbG9hZERhdGEob3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH0pOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICh0aGlzLnJlbG9hZERhdGFQcm9taXNlICYmICFvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgIH1cbiAgICB0aGlzLnJlbG9hZERhdGFQcm9taXNlID0gdGhpcy5nZXRBbGxDbGFzc2VzKG9wdGlvbnMpXG4gICAgICAudGhlbihcbiAgICAgICAgYWxsU2NoZW1hcyA9PiB7XG4gICAgICAgICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoYWxsU2NoZW1hcywgdGhpcy5wcm90ZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgICAgICB9LFxuICAgICAgICBlcnIgPT4ge1xuICAgICAgICAgIHRoaXMuc2NoZW1hRGF0YSA9IG5ldyBTY2hlbWFEYXRhKCk7XG4gICAgICAgICAgZGVsZXRlIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICApXG4gICAgICAudGhlbigoKSA9PiB7fSk7XG4gICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gIH1cblxuICBhc3luYyBnZXRBbGxDbGFzc2VzKG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9KTogUHJvbWlzZTxBcnJheTxTY2hlbWE+PiB7XG4gICAgaWYgKG9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLnJlbG9hZERhdGFJZk5lZWRlZCgpO1xuICAgIGNvbnN0IGNhY2hlZCA9IFNjaGVtYUNhY2hlLmFsbCgpO1xuICAgIGlmIChjYWNoZWQgJiYgY2FjaGVkLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShjYWNoZWQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zZXRBbGxDbGFzc2VzKCk7XG4gIH1cblxuICBzZXRBbGxDbGFzc2VzKCk6IFByb21pc2U8QXJyYXk8U2NoZW1hPj4ge1xuICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXJcbiAgICAgIC5nZXRBbGxDbGFzc2VzKClcbiAgICAgIC50aGVuKGFsbFNjaGVtYXMgPT4gYWxsU2NoZW1hcy5tYXAoaW5qZWN0RGVmYXVsdFNjaGVtYSkpXG4gICAgICAudGhlbihhbGxTY2hlbWFzID0+IHtcbiAgICAgICAgU2NoZW1hQ2FjaGUucHV0KGFsbFNjaGVtYXMpO1xuICAgICAgICByZXR1cm4gYWxsU2NoZW1hcztcbiAgICAgIH0pO1xuICB9XG5cbiAgZ2V0T25lU2NoZW1hKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGFsbG93Vm9sYXRpbGVDbGFzc2VzOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWE+IHtcbiAgICBpZiAob3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICBTY2hlbWFDYWNoZS5jbGVhcigpO1xuICAgIH1cbiAgICBpZiAoYWxsb3dWb2xhdGlsZUNsYXNzZXMgJiYgdm9sYXRpbGVDbGFzc2VzLmluZGV4T2YoY2xhc3NOYW1lKSA+IC0xKSB7XG4gICAgICBjb25zdCBkYXRhID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBmaWVsZHM6IGRhdGEuZmllbGRzLFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICBpbmRleGVzOiBkYXRhLmluZGV4ZXMsXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3QgY2FjaGVkID0gU2NoZW1hQ2FjaGUuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKGNhY2hlZCAmJiAhb3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNhY2hlZCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnNldEFsbENsYXNzZXMoKS50aGVuKGFsbFNjaGVtYXMgPT4ge1xuICAgICAgY29uc3Qgb25lU2NoZW1hID0gYWxsU2NoZW1hcy5maW5kKHNjaGVtYSA9PiBzY2hlbWEuY2xhc3NOYW1lID09PSBjbGFzc05hbWUpO1xuICAgICAgaWYgKCFvbmVTY2hlbWEpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHVuZGVmaW5lZCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gb25lU2NoZW1hO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgbmV3IGNsYXNzIHRoYXQgaW5jbHVkZXMgdGhlIHRocmVlIGRlZmF1bHQgZmllbGRzLlxuICAvLyBBQ0wgaXMgYW4gaW1wbGljaXQgY29sdW1uIHRoYXQgZG9lcyBub3QgZ2V0IGFuIGVudHJ5IGluIHRoZVxuICAvLyBfU0NIRU1BUyBkYXRhYmFzZS4gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoIHRoZVxuICAvLyBjcmVhdGVkIHNjaGVtYSwgaW4gbW9uZ28gZm9ybWF0LlxuICAvLyBvbiBzdWNjZXNzLCBhbmQgcmVqZWN0cyB3aXRoIGFuIGVycm9yIG9uIGZhaWwuIEVuc3VyZSB5b3VcbiAgLy8gaGF2ZSBhdXRob3JpemF0aW9uIChtYXN0ZXIga2V5LCBvciBjbGllbnQgY2xhc3MgY3JlYXRpb25cbiAgLy8gZW5hYmxlZCkgYmVmb3JlIGNhbGxpbmcgdGhpcyBmdW5jdGlvbi5cbiAgYXN5bmMgYWRkQ2xhc3NJZk5vdEV4aXN0cyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZHM6IFNjaGVtYUZpZWxkcyA9IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55LFxuICAgIGluZGV4ZXM6IGFueSA9IHt9XG4gICk6IFByb21pc2U8dm9pZCB8IFNjaGVtYT4ge1xuICAgIHZhciB2YWxpZGF0aW9uRXJyb3IgPSB0aGlzLnZhbGlkYXRlTmV3Q2xhc3MoY2xhc3NOYW1lLCBmaWVsZHMsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyk7XG4gICAgaWYgKHZhbGlkYXRpb25FcnJvcikge1xuICAgICAgaWYgKHZhbGlkYXRpb25FcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh2YWxpZGF0aW9uRXJyb3IpO1xuICAgICAgfSBlbHNlIGlmICh2YWxpZGF0aW9uRXJyb3IuY29kZSAmJiB2YWxpZGF0aW9uRXJyb3IuZXJyb3IpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcih2YWxpZGF0aW9uRXJyb3IuY29kZSwgdmFsaWRhdGlvbkVycm9yLmVycm9yKSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodmFsaWRhdGlvbkVycm9yKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGFkYXB0ZXJTY2hlbWEgPSBhd2FpdCB0aGlzLl9kYkFkYXB0ZXIuY3JlYXRlQ2xhc3MoXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSh7XG4gICAgICAgICAgZmllbGRzLFxuICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICBpbmRleGVzLFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgICAvLyBUT0RPOiBSZW1vdmUgYnkgdXBkYXRpbmcgc2NoZW1hIGNhY2hlIGRpcmVjdGx5XG4gICAgICBhd2FpdCB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgY29uc3QgcGFyc2VTY2hlbWEgPSBjb252ZXJ0QWRhcHRlclNjaGVtYVRvUGFyc2VTY2hlbWEoYWRhcHRlclNjaGVtYSk7XG4gICAgICByZXR1cm4gcGFyc2VTY2hlbWE7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHVwZGF0ZUNsYXNzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEZpZWxkczogU2NoZW1hRmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55LFxuICAgIGluZGV4ZXM6IGFueSxcbiAgICBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyXG4gICkge1xuICAgIHJldHVybiB0aGlzLmdldE9uZVNjaGVtYShjbGFzc05hbWUpXG4gICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZ0ZpZWxkcyA9IHNjaGVtYS5maWVsZHM7XG4gICAgICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEZpZWxkcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEZpZWxkc1tuYW1lXTtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBleGlzdGluZ0ZpZWxkc1tuYW1lXSAmJlxuICAgICAgICAgICAgZXhpc3RpbmdGaWVsZHNbbmFtZV0udHlwZSAhPT0gZmllbGQudHlwZSAmJlxuICAgICAgICAgICAgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZSdcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFleGlzdGluZ0ZpZWxkc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDI1NSwgYEZpZWxkICR7bmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBkZWxldGUgZXhpc3RpbmdGaWVsZHMuX3JwZXJtO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdGaWVsZHMuX3dwZXJtO1xuICAgICAgICBjb25zdCBuZXdTY2hlbWEgPSBidWlsZE1lcmdlZFNjaGVtYU9iamVjdChleGlzdGluZ0ZpZWxkcywgc3VibWl0dGVkRmllbGRzKTtcbiAgICAgICAgY29uc3QgZGVmYXVsdEZpZWxkcyA9IGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gfHwgZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQ7XG4gICAgICAgIGNvbnN0IGZ1bGxOZXdTY2hlbWEgPSBPYmplY3QuYXNzaWduKHt9LCBuZXdTY2hlbWEsIGRlZmF1bHRGaWVsZHMpO1xuICAgICAgICBjb25zdCB2YWxpZGF0aW9uRXJyb3IgPSB0aGlzLnZhbGlkYXRlU2NoZW1hRGF0YShcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgbmV3U2NoZW1hLFxuICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICBPYmplY3Qua2V5cyhleGlzdGluZ0ZpZWxkcylcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHZhbGlkYXRpb25FcnJvcikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcih2YWxpZGF0aW9uRXJyb3IuY29kZSwgdmFsaWRhdGlvbkVycm9yLmVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZpbmFsbHkgd2UgaGF2ZSBjaGVja2VkIHRvIG1ha2Ugc3VyZSB0aGUgcmVxdWVzdCBpcyB2YWxpZCBhbmQgd2UgY2FuIHN0YXJ0IGRlbGV0aW5nIGZpZWxkcy5cbiAgICAgICAgLy8gRG8gYWxsIGRlbGV0aW9ucyBmaXJzdCwgdGhlbiBhIHNpbmdsZSBzYXZlIHRvIF9TQ0hFTUEgY29sbGVjdGlvbiB0byBoYW5kbGUgYWxsIGFkZGl0aW9ucy5cbiAgICAgICAgY29uc3QgZGVsZXRlZEZpZWxkczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgY29uc3QgaW5zZXJ0ZWRGaWVsZHMgPSBbXTtcbiAgICAgICAgT2JqZWN0LmtleXMoc3VibWl0dGVkRmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKHN1Ym1pdHRlZEZpZWxkc1tmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICBkZWxldGVkRmllbGRzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaW5zZXJ0ZWRGaWVsZHMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgbGV0IGRlbGV0ZVByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgaWYgKGRlbGV0ZWRGaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGRlbGV0ZVByb21pc2UgPSB0aGlzLmRlbGV0ZUZpZWxkcyhkZWxldGVkRmllbGRzLCBjbGFzc05hbWUsIGRhdGFiYXNlKTtcbiAgICAgICAgfVxuICAgICAgICBsZXQgZW5mb3JjZUZpZWxkcyA9IFtdO1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIGRlbGV0ZVByb21pc2UgLy8gRGVsZXRlIEV2ZXJ5dGhpbmdcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSkpIC8vIFJlbG9hZCBvdXIgU2NoZW1hLCBzbyB3ZSBoYXZlIGFsbCB0aGUgbmV3IHZhbHVlc1xuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBwcm9taXNlcyA9IGluc2VydGVkRmllbGRzLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGUgPSBzdWJtaXR0ZWRGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5lbmZvcmNlRmllbGRFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgICAgZW5mb3JjZUZpZWxkcyA9IHJlc3VsdHMuZmlsdGVyKHJlc3VsdCA9PiAhIXJlc3VsdCk7XG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLnNldFBlcm1pc3Npb25zKGNsYXNzTmFtZSwgY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBuZXdTY2hlbWEpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+XG4gICAgICAgICAgICAgIHRoaXMuX2RiQWRhcHRlci5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgaW5kZXhlcyxcbiAgICAgICAgICAgICAgICBzY2hlbWEuaW5kZXhlcyxcbiAgICAgICAgICAgICAgICBmdWxsTmV3U2NoZW1hXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSkpXG4gICAgICAgICAgICAvL1RPRE86IE1vdmUgdGhpcyBsb2dpYyBpbnRvIHRoZSBkYXRhYmFzZSBhZGFwdGVyXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHRoaXMuZW5zdXJlRmllbGRzKGVuZm9yY2VGaWVsZHMpO1xuICAgICAgICAgICAgICBjb25zdCBzY2hlbWEgPSB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICAgICAgICAgICAgY29uc3QgcmVsb2FkZWRTY2hlbWE6IFNjaGVtYSA9IHtcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICBpZiAoc2NoZW1hLmluZGV4ZXMgJiYgT2JqZWN0LmtleXMoc2NoZW1hLmluZGV4ZXMpLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgICAgICAgIHJlbG9hZGVkU2NoZW1hLmluZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gcmVsb2FkZWRTY2hlbWE7XG4gICAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBkb2VzIG5vdCBleGlzdC5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSB0byB0aGUgbmV3IHNjaGVtYVxuICAvLyBvYmplY3Qgb3IgZmFpbHMgd2l0aCBhIHJlYXNvbi5cbiAgZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyPiB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICAgIH1cbiAgICAvLyBXZSBkb24ndCBoYXZlIHRoaXMgY2xhc3MuIFVwZGF0ZSB0aGUgc2NoZW1hXG4gICAgcmV0dXJuIChcbiAgICAgIC8vIFRoZSBzY2hlbWEgdXBkYXRlIHN1Y2NlZWRlZC4gUmVsb2FkIHRoZSBzY2hlbWFcbiAgICAgIHRoaXMuYWRkQ2xhc3NJZk5vdEV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSB1cGRhdGUgZmFpbGVkLiBUaGlzIGNhbiBiZSBva2F5IC0gaXQgbWlnaHRcbiAgICAgICAgICAvLyBoYXZlIGZhaWxlZCBiZWNhdXNlIHRoZXJlJ3MgYSByYWNlIGNvbmRpdGlvbiBhbmQgYSBkaWZmZXJlbnRcbiAgICAgICAgICAvLyBjbGllbnQgaXMgbWFraW5nIHRoZSBleGFjdCBzYW1lIHNjaGVtYSB1cGRhdGUgdGhhdCB3ZSB3YW50LlxuICAgICAgICAgIC8vIFNvIGp1c3QgcmVsb2FkIHRoZSBzY2hlbWEuXG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAvLyBFbnN1cmUgdGhhdCB0aGUgc2NoZW1hIG5vdyB2YWxpZGF0ZXNcbiAgICAgICAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgRmFpbGVkIHRvIGFkZCAke2NsYXNzTmFtZX1gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSBzdGlsbCBkb2Vzbid0IHZhbGlkYXRlLiBHaXZlIHVwXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ3NjaGVtYSBjbGFzcyBuYW1lIGRvZXMgbm90IHJldmFsaWRhdGUnKTtcbiAgICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgdmFsaWRhdGVOZXdDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgZmllbGRzOiBTY2hlbWFGaWVsZHMgPSB7fSwgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBhbnkpOiBhbnkge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICB9XG4gICAgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgZXJyb3I6IGludmFsaWRDbGFzc05hbWVNZXNzYWdlKGNsYXNzTmFtZSksXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZVNjaGVtYURhdGEoY2xhc3NOYW1lLCBmaWVsZHMsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgW10pO1xuICB9XG5cbiAgdmFsaWRhdGVTY2hlbWFEYXRhKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkczogU2NoZW1hRmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogQ2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgIGV4aXN0aW5nRmllbGROYW1lczogQXJyYXk8c3RyaW5nPlxuICApIHtcbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBmaWVsZHMpIHtcbiAgICAgIGlmIChleGlzdGluZ0ZpZWxkTmFtZXMuaW5kZXhPZihmaWVsZE5hbWUpIDwgMCkge1xuICAgICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICBlcnJvcjogJ2ludmFsaWQgZmllbGQgbmFtZTogJyArIGZpZWxkTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZEZvckNsYXNzKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb2RlOiAxMzYsXG4gICAgICAgICAgICBlcnJvcjogJ2ZpZWxkICcgKyBmaWVsZE5hbWUgKyAnIGNhbm5vdCBiZSBhZGRlZCcsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgY29uc3QgZXJyb3IgPSBmaWVsZFR5cGVJc0ludmFsaWQoZmllbGRUeXBlKTtcbiAgICAgICAgaWYgKGVycm9yKSByZXR1cm4geyBjb2RlOiBlcnJvci5jb2RlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICBpZiAoZmllbGRUeXBlLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgbGV0IGRlZmF1bHRWYWx1ZVR5cGUgPSBnZXRUeXBlKGZpZWxkVHlwZS5kZWZhdWx0VmFsdWUpO1xuICAgICAgICAgIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGRlZmF1bHRWYWx1ZVR5cGUgPSB7IHR5cGU6IGRlZmF1bHRWYWx1ZVR5cGUgfTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnb2JqZWN0JyAmJiBmaWVsZFR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgVGhlICdkZWZhdWx0IHZhbHVlJyBvcHRpb24gaXMgbm90IGFwcGxpY2FibGUgZm9yICR7dHlwZVRvU3RyaW5nKGZpZWxkVHlwZSl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZmllbGRUeXBlLCBkZWZhdWx0VmFsdWVUeXBlKSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9IGRlZmF1bHQgdmFsdWU7IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZVxuICAgICAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKGRlZmF1bHRWYWx1ZVR5cGUpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFR5cGUucmVxdWlyZWQpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIGZpZWxkVHlwZSA9PT0gJ29iamVjdCcgJiYgZmllbGRUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYFRoZSAncmVxdWlyZWQnIG9wdGlvbiBpcyBub3QgYXBwbGljYWJsZSBmb3IgJHt0eXBlVG9TdHJpbmcoZmllbGRUeXBlKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdKSB7XG4gICAgICBmaWVsZHNbZmllbGROYW1lXSA9IGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXTtcbiAgICB9XG5cbiAgICBjb25zdCBnZW9Qb2ludHMgPSBPYmplY3Qua2V5cyhmaWVsZHMpLmZpbHRlcihcbiAgICAgIGtleSA9PiBmaWVsZHNba2V5XSAmJiBmaWVsZHNba2V5XS50eXBlID09PSAnR2VvUG9pbnQnXG4gICAgKTtcbiAgICBpZiAoZ2VvUG9pbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICBlcnJvcjpcbiAgICAgICAgICAnY3VycmVudGx5LCBvbmx5IG9uZSBHZW9Qb2ludCBmaWVsZCBtYXkgZXhpc3QgaW4gYW4gb2JqZWN0LiBBZGRpbmcgJyArXG4gICAgICAgICAgZ2VvUG9pbnRzWzFdICtcbiAgICAgICAgICAnIHdoZW4gJyArXG4gICAgICAgICAgZ2VvUG9pbnRzWzBdICtcbiAgICAgICAgICAnIGFscmVhZHkgZXhpc3RzLicsXG4gICAgICB9O1xuICAgIH1cbiAgICB2YWxpZGF0ZUNMUChjbGFzc0xldmVsUGVybWlzc2lvbnMsIGZpZWxkcywgdGhpcy51c2VySWRSZWdFeCk7XG4gIH1cblxuICAvLyBTZXRzIHRoZSBDbGFzcy1sZXZlbCBwZXJtaXNzaW9ucyBmb3IgYSBnaXZlbiBjbGFzc05hbWUsIHdoaWNoIG11c3QgZXhpc3QuXG4gIGFzeW5jIHNldFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBwZXJtczogYW55LCBuZXdTY2hlbWE6IFNjaGVtYUZpZWxkcykge1xuICAgIGlmICh0eXBlb2YgcGVybXMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIHZhbGlkYXRlQ0xQKHBlcm1zLCBuZXdTY2hlbWEsIHRoaXMudXNlcklkUmVnRXgpO1xuICAgIGF3YWl0IHRoaXMuX2RiQWRhcHRlci5zZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lLCBwZXJtcyk7XG4gICAgY29uc3QgY2FjaGVkID0gU2NoZW1hQ2FjaGUuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKGNhY2hlZCkge1xuICAgICAgY2FjaGVkLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IHBlcm1zO1xuICAgIH1cbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IHRvIHRoZSBuZXcgc2NoZW1hXG4gIC8vIG9iamVjdCBpZiB0aGUgcHJvdmlkZWQgY2xhc3NOYW1lLWZpZWxkTmFtZS10eXBlIHR1cGxlIGlzIHZhbGlkLlxuICAvLyBUaGUgY2xhc3NOYW1lIG11c3QgYWxyZWFkeSBiZSB2YWxpZGF0ZWQuXG4gIC8vIElmICdmcmVlemUnIGlzIHRydWUsIHJlZnVzZSB0byB1cGRhdGUgdGhlIHNjaGVtYSBmb3IgdGhpcyBmaWVsZC5cbiAgZW5mb3JjZUZpZWxkRXhpc3RzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkTmFtZTogc3RyaW5nLFxuICAgIHR5cGU6IHN0cmluZyB8IFNjaGVtYUZpZWxkLFxuICAgIGlzVmFsaWRhdGlvbj86IGJvb2xlYW4sXG4gICAgbWFpbnRlbmFuY2U/OiBib29sZWFuXG4gICkge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gMCkge1xuICAgICAgLy8gc3ViZG9jdW1lbnQga2V5ICh4LnkpID0+IG9rIGlmIHggaXMgb2YgdHlwZSAnb2JqZWN0J1xuICAgICAgZmllbGROYW1lID0gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG4gICAgICB0eXBlID0gJ09iamVjdCc7XG4gICAgfVxuICAgIGxldCBmaWVsZE5hbWVUb1ZhbGlkYXRlID0gYCR7ZmllbGROYW1lfWA7XG4gICAgaWYgKG1haW50ZW5hbmNlICYmIGZpZWxkTmFtZVRvVmFsaWRhdGUuY2hhckF0KDApID09PSAnXycpIHtcbiAgICAgIGZpZWxkTmFtZVRvVmFsaWRhdGUgPSBmaWVsZE5hbWVUb1ZhbGlkYXRlLnN1YnN0cmluZygxKTtcbiAgICB9XG4gICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZVRvVmFsaWRhdGUsIGNsYXNzTmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgSW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX0uYCk7XG4gICAgfVxuXG4gICAgLy8gSWYgc29tZW9uZSB0cmllcyB0byBjcmVhdGUgYSBuZXcgZmllbGQgd2l0aCBudWxsL3VuZGVmaW5lZCBhcyB0aGUgdmFsdWUsIHJldHVybjtcbiAgICBpZiAoIXR5cGUpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBmaWVsZE5hbWUpO1xuICAgIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHR5cGUgPSAoeyB0eXBlIH06IFNjaGVtYUZpZWxkKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgbGV0IGRlZmF1bHRWYWx1ZVR5cGUgPSBnZXRUeXBlKHR5cGUuZGVmYXVsdFZhbHVlKTtcbiAgICAgIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZGVmYXVsdFZhbHVlVHlwZSA9IHsgdHlwZTogZGVmYXVsdFZhbHVlVHlwZSB9O1xuICAgICAgfVxuICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZSh0eXBlLCBkZWZhdWx0VmFsdWVUeXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgYHNjaGVtYSBtaXNtYXRjaCBmb3IgJHtjbGFzc05hbWV9LiR7ZmllbGROYW1lfSBkZWZhdWx0IHZhbHVlOyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgIHR5cGVcbiAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKGRlZmF1bHRWYWx1ZVR5cGUpfWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZXhwZWN0ZWRUeXBlKSB7XG4gICAgICBpZiAoIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKGV4cGVjdGVkVHlwZSwgdHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgIGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX07IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgZXhwZWN0ZWRUeXBlXG4gICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyh0eXBlKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBJZiB0eXBlIG9wdGlvbnMgZG8gbm90IGNoYW5nZVxuICAgICAgLy8gd2UgY2FuIHNhZmVseSByZXR1cm5cbiAgICAgIGlmIChpc1ZhbGlkYXRpb24gfHwgSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRUeXBlKSA9PT0gSlNPTi5zdHJpbmdpZnkodHlwZSkpIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIC8vIEZpZWxkIG9wdGlvbnMgYXJlIG1heSBiZSBjaGFuZ2VkXG4gICAgICAvLyBlbnN1cmUgdG8gaGF2ZSBhbiB1cGRhdGUgdG8gZGF0ZSBzY2hlbWEgZmllbGRcbiAgICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXIudXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyXG4gICAgICAuYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFKSB7XG4gICAgICAgICAgLy8gTWFrZSBzdXJlIHRoYXQgd2UgdGhyb3cgZXJyb3JzIHdoZW4gaXQgaXMgYXBwcm9wcmlhdGUgdG8gZG8gc28uXG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVGhlIHVwZGF0ZSBmYWlsZWQuIFRoaXMgY2FuIGJlIG9rYXkgLSBpdCBtaWdodCBoYXZlIGJlZW4gYSByYWNlXG4gICAgICAgIC8vIGNvbmRpdGlvbiB3aGVyZSBhbm90aGVyIGNsaWVudCB1cGRhdGVkIHRoZSBzY2hlbWEgaW4gdGhlIHNhbWVcbiAgICAgICAgLy8gd2F5IHRoYXQgd2Ugd2FudGVkIHRvLiBTbywganVzdCByZWxvYWQgdGhlIHNjaGVtYVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgdHlwZSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG5cbiAgZW5zdXJlRmllbGRzKGZpZWxkczogYW55KSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZHMubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUgfSA9IGZpZWxkc1tpXTtcbiAgICAgIGxldCB7IHR5cGUgfSA9IGZpZWxkc1tpXTtcbiAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwgZmllbGROYW1lKTtcbiAgICAgIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdHlwZSA9IHsgdHlwZTogdHlwZSB9O1xuICAgICAgfVxuICAgICAgaWYgKCFleHBlY3RlZFR5cGUgfHwgIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKGV4cGVjdGVkVHlwZSwgdHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYENvdWxkIG5vdCBhZGQgZmllbGQgJHtmaWVsZE5hbWV9YCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gbWFpbnRhaW4gY29tcGF0aWJpbGl0eVxuICBkZWxldGVGaWVsZChmaWVsZE5hbWU6IHN0cmluZywgY2xhc3NOYW1lOiBzdHJpbmcsIGRhdGFiYXNlOiBEYXRhYmFzZUNvbnRyb2xsZXIpIHtcbiAgICByZXR1cm4gdGhpcy5kZWxldGVGaWVsZHMoW2ZpZWxkTmFtZV0sIGNsYXNzTmFtZSwgZGF0YWJhc2UpO1xuICB9XG5cbiAgLy8gRGVsZXRlIGZpZWxkcywgYW5kIHJlbW92ZSB0aGF0IGRhdGEgZnJvbSBhbGwgb2JqZWN0cy4gVGhpcyBpcyBpbnRlbmRlZFxuICAvLyB0byByZW1vdmUgdW51c2VkIGZpZWxkcywgaWYgb3RoZXIgd3JpdGVycyBhcmUgd3JpdGluZyBvYmplY3RzIHRoYXQgaW5jbHVkZVxuICAvLyB0aGlzIGZpZWxkLCB0aGUgZmllbGQgbWF5IHJlYXBwZWFyLiBSZXR1cm5zIGEgUHJvbWlzZSB0aGF0IHJlc29sdmVzIHdpdGhcbiAgLy8gbm8gb2JqZWN0IG9uIHN1Y2Nlc3MsIG9yIHJlamVjdHMgd2l0aCB7IGNvZGUsIGVycm9yIH0gb24gZmFpbHVyZS5cbiAgLy8gUGFzc2luZyB0aGUgZGF0YWJhc2UgYW5kIHByZWZpeCBpcyBuZWNlc3NhcnkgaW4gb3JkZXIgdG8gZHJvcCByZWxhdGlvbiBjb2xsZWN0aW9uc1xuICAvLyBhbmQgcmVtb3ZlIGZpZWxkcyBmcm9tIG9iamVjdHMuIElkZWFsbHkgdGhlIGRhdGFiYXNlIHdvdWxkIGJlbG9uZyB0b1xuICAvLyBhIGRhdGFiYXNlIGFkYXB0ZXIgYW5kIHRoaXMgZnVuY3Rpb24gd291bGQgY2xvc2Ugb3ZlciBpdCBvciBhY2Nlc3MgaXQgdmlhIG1lbWJlci5cbiAgZGVsZXRlRmllbGRzKGZpZWxkTmFtZXM6IEFycmF5PHN0cmluZz4sIGNsYXNzTmFtZTogc3RyaW5nLCBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyKSB7XG4gICAgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGludmFsaWRDbGFzc05hbWVNZXNzYWdlKGNsYXNzTmFtZSkpO1xuICAgIH1cblxuICAgIGZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYGludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9YCk7XG4gICAgICB9XG4gICAgICAvL0Rvbid0IGFsbG93IGRlbGV0aW5nIHRoZSBkZWZhdWx0IGZpZWxkcy5cbiAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZEZvckNsYXNzKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCBgZmllbGQgJHtmaWVsZE5hbWV9IGNhbm5vdCBiZSBjaGFuZ2VkYCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gdGhpcy5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCBmYWxzZSwgeyBjbGVhckNhY2hlOiB0cnVlIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gZG9lcyBub3QgZXhpc3QuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICBmaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDI1NSwgYEZpZWxkICR7ZmllbGROYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHNjaGVtYUZpZWxkcyA9IHsgLi4uc2NoZW1hLmZpZWxkcyB9O1xuICAgICAgICByZXR1cm4gZGF0YWJhc2UuYWRhcHRlci5kZWxldGVGaWVsZHMoY2xhc3NOYW1lLCBzY2hlbWEsIGZpZWxkTmFtZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgICAgIGZpZWxkTmFtZXMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gc2NoZW1hRmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICAgIGlmIChmaWVsZCAmJiBmaWVsZC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgICAgICAgICAgLy9Gb3IgcmVsYXRpb25zLCBkcm9wIHRoZSBfSm9pbiB0YWJsZVxuICAgICAgICAgICAgICAgIHJldHVybiBkYXRhYmFzZS5hZGFwdGVyLmRlbGV0ZUNsYXNzKGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICApO1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIFNjaGVtYUNhY2hlLmNsZWFyKCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyBhbiBvYmplY3QgcHJvdmlkZWQgaW4gUkVTVCBmb3JtYXQuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIG5ldyBzY2hlbWEgaWYgdGhpcyBvYmplY3QgaXNcbiAgLy8gdmFsaWQuXG4gIGFzeW5jIHZhbGlkYXRlT2JqZWN0KGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgcXVlcnk6IGFueSwgbWFpbnRlbmFuY2U6IGJvb2xlYW4pIHtcbiAgICBsZXQgZ2VvY291bnQgPSAwO1xuICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IHRoaXMuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSk7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIGdldFR5cGUob2JqZWN0W2ZpZWxkTmFtZV0pID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIGdlb2NvdW50Kys7XG4gICAgICB9XG4gICAgICBpZiAoZ2VvY291bnQgPiAxKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICd0aGVyZSBjYW4gb25seSBiZSBvbmUgZ2VvcG9pbnQgZmllbGQgaW4gYSBjbGFzcydcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBleHBlY3RlZCA9IGdldFR5cGUob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgaWYgKCFleHBlY3RlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdBQ0wnKSB7XG4gICAgICAgIC8vIEV2ZXJ5IG9iamVjdCBoYXMgQUNMIGltcGxpY2l0bHkuXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgcHJvbWlzZXMucHVzaChzY2hlbWEuZW5mb3JjZUZpZWxkRXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCBleHBlY3RlZCwgdHJ1ZSwgbWFpbnRlbmFuY2UpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBjb25zdCBlbmZvcmNlRmllbGRzID0gcmVzdWx0cy5maWx0ZXIocmVzdWx0ID0+ICEhcmVzdWx0KTtcblxuICAgIGlmIChlbmZvcmNlRmllbGRzLmxlbmd0aCAhPT0gMCkge1xuICAgICAgLy8gVE9ETzogUmVtb3ZlIGJ5IHVwZGF0aW5nIHNjaGVtYSBjYWNoZSBkaXJlY3RseVxuICAgICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgdGhpcy5lbnN1cmVGaWVsZHMoZW5mb3JjZUZpZWxkcyk7XG5cbiAgICBjb25zdCBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoZW5WYWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhwcm9taXNlLCBjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIHRoYXQgYWxsIHRoZSBwcm9wZXJ0aWVzIGFyZSBzZXQgZm9yIHRoZSBvYmplY3RcbiAgdmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgY29sdW1ucyA9IHJlcXVpcmVkQ29sdW1ucy53cml0ZVtjbGFzc05hbWVdO1xuICAgIGlmICghY29sdW1ucyB8fCBjb2x1bW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICAgIH1cblxuICAgIGNvbnN0IG1pc3NpbmdDb2x1bW5zID0gY29sdW1ucy5maWx0ZXIoZnVuY3Rpb24gKGNvbHVtbikge1xuICAgICAgaWYgKHF1ZXJ5ICYmIHF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIGlmIChvYmplY3RbY29sdW1uXSAmJiB0eXBlb2Ygb2JqZWN0W2NvbHVtbl0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgLy8gVHJ5aW5nIHRvIGRlbGV0ZSBhIHJlcXVpcmVkIGNvbHVtblxuICAgICAgICAgIHJldHVybiBvYmplY3RbY29sdW1uXS5fX29wID09ICdEZWxldGUnO1xuICAgICAgICB9XG4gICAgICAgIC8vIE5vdCB0cnlpbmcgdG8gZG8gYW55dGhpbmcgdGhlcmVcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuICFvYmplY3RbY29sdW1uXTtcbiAgICB9KTtcblxuICAgIGlmIChtaXNzaW5nQ29sdW1ucy5sZW5ndGggPiAwKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsIG1pc3NpbmdDb2x1bW5zWzBdICsgJyBpcyByZXF1aXJlZC4nKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgfVxuXG4gIHRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZywgYWNsR3JvdXA6IHN0cmluZ1tdLCBvcGVyYXRpb246IHN0cmluZykge1xuICAgIHJldHVybiBTY2hlbWFDb250cm9sbGVyLnRlc3RQZXJtaXNzaW9ucyhcbiAgICAgIHRoaXMuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSksXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wZXJhdGlvblxuICAgICk7XG4gIH1cblxuICAvLyBUZXN0cyB0aGF0IHRoZSBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uIGxldCBwYXNzIHRoZSBvcGVyYXRpb24gZm9yIGEgZ2l2ZW4gYWNsR3JvdXBcbiAgc3RhdGljIHRlc3RQZXJtaXNzaW9ucyhjbGFzc1Blcm1pc3Npb25zOiA/YW55LCBhY2xHcm91cDogc3RyaW5nW10sIG9wZXJhdGlvbjogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgaWYgKCFjbGFzc1Blcm1pc3Npb25zIHx8ICFjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl0pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXTtcbiAgICBpZiAocGVybXNbJyonXSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8vIENoZWNrIHBlcm1pc3Npb25zIGFnYWluc3QgdGhlIGFjbEdyb3VwIHByb3ZpZGVkIChhcnJheSBvZiB1c2VySWQvcm9sZXMpXG4gICAgaWYgKFxuICAgICAgYWNsR3JvdXAuc29tZShhY2wgPT4ge1xuICAgICAgICByZXR1cm4gcGVybXNbYWNsXSA9PT0gdHJ1ZTtcbiAgICAgIH0pXG4gICAgKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9wZXJhdGlvbiBwYXNzZXMgY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMgc2V0IGluIHRoZSBzY2hlbWFcbiAgc3RhdGljIHZhbGlkYXRlUGVybWlzc2lvbihcbiAgICBjbGFzc1Blcm1pc3Npb25zOiA/YW55LFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGFjbEdyb3VwOiBzdHJpbmdbXSxcbiAgICBvcGVyYXRpb246IHN0cmluZyxcbiAgICBhY3Rpb24/OiBzdHJpbmdcbiAgKSB7XG4gICAgaWYgKFNjaGVtYUNvbnRyb2xsZXIudGVzdFBlcm1pc3Npb25zKGNsYXNzUGVybWlzc2lvbnMsIGFjbEdyb3VwLCBvcGVyYXRpb24pKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgaWYgKCFjbGFzc1Blcm1pc3Npb25zIHx8ICFjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl0pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXTtcbiAgICAvLyBJZiBvbmx5IGZvciBhdXRoZW50aWNhdGVkIHVzZXJzXG4gICAgLy8gbWFrZSBzdXJlIHdlIGhhdmUgYW4gYWNsR3JvdXBcbiAgICBpZiAocGVybXNbJ3JlcXVpcmVzQXV0aGVudGljYXRpb24nXSkge1xuICAgICAgLy8gSWYgYWNsR3JvdXAgaGFzICogKHB1YmxpYylcbiAgICAgIGlmICghYWNsR3JvdXAgfHwgYWNsR3JvdXAubGVuZ3RoID09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgJ1Blcm1pc3Npb24gZGVuaWVkLCB1c2VyIG5lZWRzIHRvIGJlIGF1dGhlbnRpY2F0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChhY2xHcm91cC5pbmRleE9mKCcqJykgPiAtMSAmJiBhY2xHcm91cC5sZW5ndGggPT0gMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnUGVybWlzc2lvbiBkZW5pZWQsIHVzZXIgbmVlZHMgdG8gYmUgYXV0aGVudGljYXRlZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyByZXF1aXJlc0F1dGhlbnRpY2F0aW9uIHBhc3NlZCwganVzdCBtb3ZlIGZvcndhcmRcbiAgICAgIC8vIHByb2JhYmx5IHdvdWxkIGJlIHdpc2UgYXQgc29tZSBwb2ludCB0byByZW5hbWUgdG8gJ2F1dGhlbnRpY2F0ZWRVc2VyJ1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIC8vIE5vIG1hdGNoaW5nIENMUCwgbGV0J3MgY2hlY2sgdGhlIFBvaW50ZXIgcGVybWlzc2lvbnNcbiAgICAvLyBBbmQgaGFuZGxlIHRob3NlIGxhdGVyXG4gICAgY29uc3QgcGVybWlzc2lvbkZpZWxkID1cbiAgICAgIFsnZ2V0JywgJ2ZpbmQnLCAnY291bnQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMSA/ICdyZWFkVXNlckZpZWxkcycgOiAnd3JpdGVVc2VyRmllbGRzJztcblxuICAgIC8vIFJlamVjdCBjcmVhdGUgd2hlbiB3cml0ZSBsb2NrZG93blxuICAgIGlmIChwZXJtaXNzaW9uRmllbGQgPT0gJ3dyaXRlVXNlckZpZWxkcycgJiYgb3BlcmF0aW9uID09ICdjcmVhdGUnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIGBQZXJtaXNzaW9uIGRlbmllZCBmb3IgYWN0aW9uICR7b3BlcmF0aW9ufSBvbiBjbGFzcyAke2NsYXNzTmFtZX0uYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBQcm9jZXNzIHRoZSByZWFkVXNlckZpZWxkcyBsYXRlclxuICAgIGlmIChcbiAgICAgIEFycmF5LmlzQXJyYXkoY2xhc3NQZXJtaXNzaW9uc1twZXJtaXNzaW9uRmllbGRdKSAmJlxuICAgICAgY2xhc3NQZXJtaXNzaW9uc1twZXJtaXNzaW9uRmllbGRdLmxlbmd0aCA+IDBcbiAgICApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICBjb25zdCBwb2ludGVyRmllbGRzID0gY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHM7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocG9pbnRlckZpZWxkcykgJiYgcG9pbnRlckZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBhbnkgb3AgZXhjZXB0ICdhZGRGaWVsZCBhcyBwYXJ0IG9mIGNyZWF0ZScgaXMgb2suXG4gICAgICBpZiAob3BlcmF0aW9uICE9PSAnYWRkRmllbGQnIHx8IGFjdGlvbiA9PT0gJ3VwZGF0ZScpIHtcbiAgICAgICAgLy8gV2UgY2FuIGFsbG93IGFkZGluZyBmaWVsZCBvbiB1cGRhdGUgZmxvdyBvbmx5LlxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgIGBQZXJtaXNzaW9uIGRlbmllZCBmb3IgYWN0aW9uICR7b3BlcmF0aW9ufSBvbiBjbGFzcyAke2NsYXNzTmFtZX0uYFxuICAgICk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb3BlcmF0aW9uIHBhc3NlcyBjbGFzcy1sZXZlbC1wZXJtaXNzaW9ucyBzZXQgaW4gdGhlIHNjaGVtYVxuICB2YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lOiBzdHJpbmcsIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcsIGFjdGlvbj86IHN0cmluZykge1xuICAgIHJldHVybiBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgIHRoaXMuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSksXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wZXJhdGlvbixcbiAgICAgIGFjdGlvblxuICAgICk7XG4gIH1cblxuICBnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcpOiBhbnkge1xuICAgIHJldHVybiB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSAmJiB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gIH1cblxuICAvLyBSZXR1cm5zIHRoZSBleHBlY3RlZCB0eXBlIGZvciBhIGNsYXNzTmFtZStrZXkgY29tYmluYXRpb25cbiAgLy8gb3IgdW5kZWZpbmVkIGlmIHRoZSBzY2hlbWEgaXMgbm90IHNldFxuICBnZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nKTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0uZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gZXhwZWN0ZWRUeXBlID09PSAnbWFwJyA/ICdPYmplY3QnIDogZXhwZWN0ZWRUeXBlO1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG5cbiAgLy8gQ2hlY2tzIGlmIGEgZ2l2ZW4gY2xhc3MgaXMgaW4gdGhlIHNjaGVtYS5cbiAgaGFzQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGEoKS50aGVuKCgpID0+ICEhdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pO1xuICB9XG59XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIG5ldyBTY2hlbWEuXG5jb25zdCBsb2FkID0gKGRiQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsIG9wdGlvbnM6IGFueSk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlcj4gPT4ge1xuICBjb25zdCBzY2hlbWEgPSBuZXcgU2NoZW1hQ29udHJvbGxlcihkYkFkYXB0ZXIpO1xuICB0dGwuZHVyYXRpb24gPSBkYkFkYXB0ZXIuc2NoZW1hQ2FjaGVUdGw7XG4gIHJldHVybiBzY2hlbWEucmVsb2FkRGF0YShvcHRpb25zKS50aGVuKCgpID0+IHNjaGVtYSk7XG59O1xuXG4vLyBCdWlsZHMgYSBuZXcgc2NoZW1hIChpbiBzY2hlbWEgQVBJIHJlc3BvbnNlIGZvcm1hdCkgb3V0IG9mIGFuXG4vLyBleGlzdGluZyBtb25nbyBzY2hlbWEgKyBhIHNjaGVtYXMgQVBJIHB1dCByZXF1ZXN0LiBUaGlzIHJlc3BvbnNlXG4vLyBkb2VzIG5vdCBpbmNsdWRlIHRoZSBkZWZhdWx0IGZpZWxkcywgYXMgaXQgaXMgaW50ZW5kZWQgdG8gYmUgcGFzc2VkXG4vLyB0byBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWUuIE5vIHZhbGlkYXRpb24gaXMgZG9uZSBoZXJlLCBpdFxuLy8gaXMgZG9uZSBpbiBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWUuXG5mdW5jdGlvbiBidWlsZE1lcmdlZFNjaGVtYU9iamVjdChleGlzdGluZ0ZpZWxkczogU2NoZW1hRmllbGRzLCBwdXRSZXF1ZXN0OiBhbnkpOiBTY2hlbWFGaWVsZHMge1xuICBjb25zdCBuZXdTY2hlbWEgPSB7fTtcbiAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gIGNvbnN0IHN5c1NjaGVtYUZpZWxkID1cbiAgICBPYmplY3Qua2V5cyhkZWZhdWx0Q29sdW1ucykuaW5kZXhPZihleGlzdGluZ0ZpZWxkcy5faWQpID09PSAtMVxuICAgICAgPyBbXVxuICAgICAgOiBPYmplY3Qua2V5cyhkZWZhdWx0Q29sdW1uc1tleGlzdGluZ0ZpZWxkcy5faWRdKTtcbiAgZm9yIChjb25zdCBvbGRGaWVsZCBpbiBleGlzdGluZ0ZpZWxkcykge1xuICAgIGlmIChcbiAgICAgIG9sZEZpZWxkICE9PSAnX2lkJyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdBQ0wnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ3VwZGF0ZWRBdCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnY3JlYXRlZEF0JyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdvYmplY3RJZCdcbiAgICApIHtcbiAgICAgIGlmIChzeXNTY2hlbWFGaWVsZC5sZW5ndGggPiAwICYmIHN5c1NjaGVtYUZpZWxkLmluZGV4T2Yob2xkRmllbGQpICE9PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGZpZWxkSXNEZWxldGVkID0gcHV0UmVxdWVzdFtvbGRGaWVsZF0gJiYgcHV0UmVxdWVzdFtvbGRGaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZSc7XG4gICAgICBpZiAoIWZpZWxkSXNEZWxldGVkKSB7XG4gICAgICAgIG5ld1NjaGVtYVtvbGRGaWVsZF0gPSBleGlzdGluZ0ZpZWxkc1tvbGRGaWVsZF07XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgbmV3RmllbGQgaW4gcHV0UmVxdWVzdCkge1xuICAgIGlmIChuZXdGaWVsZCAhPT0gJ29iamVjdElkJyAmJiBwdXRSZXF1ZXN0W25ld0ZpZWxkXS5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgaWYgKHN5c1NjaGVtYUZpZWxkLmxlbmd0aCA+IDAgJiYgc3lzU2NoZW1hRmllbGQuaW5kZXhPZihuZXdGaWVsZCkgIT09IC0xKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgbmV3U2NoZW1hW25ld0ZpZWxkXSA9IHB1dFJlcXVlc3RbbmV3RmllbGRdO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbmV3U2NoZW1hO1xufVxuXG4vLyBHaXZlbiBhIHNjaGVtYSBwcm9taXNlLCBjb25zdHJ1Y3QgYW5vdGhlciBzY2hlbWEgcHJvbWlzZSB0aGF0XG4vLyB2YWxpZGF0ZXMgdGhpcyBmaWVsZCBvbmNlIHRoZSBzY2hlbWEgbG9hZHMuXG5mdW5jdGlvbiB0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoc2NoZW1hUHJvbWlzZSwgY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KSB7XG4gIHJldHVybiBzY2hlbWFQcm9taXNlLnRoZW4oc2NoZW1hID0+IHtcbiAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gIH0pO1xufVxuXG4vLyBHZXRzIHRoZSB0eXBlIGZyb20gYSBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0LCB3aGVyZSAndHlwZScgaXNcbi8vIGV4dGVuZGVkIHBhc3QgamF2YXNjcmlwdCB0eXBlcyB0byBpbmNsdWRlIHRoZSByZXN0IG9mIHRoZSBQYXJzZVxuLy8gdHlwZSBzeXN0ZW0uXG4vLyBUaGUgb3V0cHV0IHNob3VsZCBiZSBhIHZhbGlkIHNjaGVtYSB2YWx1ZS5cbi8vIFRPRE86IGVuc3VyZSB0aGF0IHRoaXMgaXMgY29tcGF0aWJsZSB3aXRoIHRoZSBmb3JtYXQgdXNlZCBpbiBPcGVuIERCXG5mdW5jdGlvbiBnZXRUeXBlKG9iajogYW55KTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICBjb25zdCB0eXBlID0gdHlwZW9mIG9iajtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gJ0Jvb2xlYW4nO1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gJ1N0cmluZyc7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiAnTnVtYmVyJztcbiAgICBjYXNlICdtYXAnOlxuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAoIW9iaikge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqKTtcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyAnYmFkIG9iajogJyArIG9iajtcbiAgfVxufVxuXG4vLyBUaGlzIGdldHMgdGhlIHR5cGUgZm9yIG5vbi1KU09OIHR5cGVzIGxpa2UgcG9pbnRlcnMgYW5kIGZpbGVzLCBidXRcbi8vIGFsc28gZ2V0cyB0aGUgYXBwcm9wcmlhdGUgdHlwZSBmb3IgJCBvcGVyYXRvcnMuXG4vLyBSZXR1cm5zIG51bGwgaWYgdGhlIHR5cGUgaXMgdW5rbm93bi5cbmZ1bmN0aW9uIGdldE9iamVjdFR5cGUob2JqKTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICBpZiAob2JqIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gJ0FycmF5JztcbiAgfVxuICBpZiAob2JqLl9fdHlwZSkge1xuICAgIHN3aXRjaCAob2JqLl9fdHlwZSkge1xuICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgIHRhcmdldENsYXNzOiBvYmouY2xhc3NOYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLmNsYXNzTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnRmlsZSc6XG4gICAgICAgIGlmIChvYmoubmFtZSkge1xuICAgICAgICAgIHJldHVybiAnRmlsZSc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdEYXRlJzpcbiAgICAgICAgaWYgKG9iai5pc28pIHtcbiAgICAgICAgICByZXR1cm4gJ0RhdGUnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICBpZiAob2JqLmxhdGl0dWRlICE9IG51bGwgJiYgb2JqLmxvbmdpdHVkZSAhPSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuICdHZW9Qb2ludCc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGlmIChvYmouYmFzZTY0KSB7XG4gICAgICAgICAgcmV0dXJuICdCeXRlcyc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgICAgaWYgKG9iai5jb29yZGluYXRlcykge1xuICAgICAgICAgIHJldHVybiAnUG9seWdvbic7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgJ1RoaXMgaXMgbm90IGEgdmFsaWQgJyArIG9iai5fX3R5cGUpO1xuICB9XG4gIGlmIChvYmpbJyRuZSddKSB7XG4gICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqWyckbmUnXSk7XG4gIH1cbiAgaWYgKG9iai5fX29wKSB7XG4gICAgc3dpdGNoIChvYmouX19vcCkge1xuICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgcmV0dXJuICdOdW1iZXInO1xuICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICBjYXNlICdBZGQnOlxuICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgIHJldHVybiAnQXJyYXknO1xuICAgICAgY2FzZSAnQWRkUmVsYXRpb24nOlxuICAgICAgY2FzZSAnUmVtb3ZlUmVsYXRpb24nOlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5vYmplY3RzWzBdLmNsYXNzTmFtZSxcbiAgICAgICAgfTtcbiAgICAgIGNhc2UgJ0JhdGNoJzpcbiAgICAgICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqLm9wc1swXSk7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyAndW5leHBlY3RlZCBvcDogJyArIG9iai5fX29wO1xuICAgIH1cbiAgfVxuICByZXR1cm4gJ09iamVjdCc7XG59XG5cbmV4cG9ydCB7XG4gIGxvYWQsXG4gIGNsYXNzTmFtZUlzVmFsaWQsXG4gIGZpZWxkTmFtZUlzVmFsaWQsXG4gIGludmFsaWRDbGFzc05hbWVNZXNzYWdlLFxuICBidWlsZE1lcmdlZFNjaGVtYU9iamVjdCxcbiAgc3lzdGVtQ2xhc3NlcyxcbiAgZGVmYXVsdENvbHVtbnMsXG4gIGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEsXG4gIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMsXG4gIFNjaGVtYUNvbnRyb2xsZXIsXG4gIHJlcXVpcmVkQ29sdW1ucyxcbn07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQWtCQSxJQUFBQSxlQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxZQUFBLEdBQUFDLHNCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxtQkFBQSxHQUFBRCxzQkFBQSxDQUFBRixPQUFBO0FB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