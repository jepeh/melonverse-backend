"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.MongoStorageAdapter = void 0;
var _MongoCollection = _interopRequireDefault(require("./MongoCollection"));
var _MongoSchemaCollection = _interopRequireDefault(require("./MongoSchemaCollection"));
var _StorageAdapter = require("../StorageAdapter");
var _mongodbUrl = require("../../../vendor/mongodbUrl");
var _MongoTransform = require("./MongoTransform");
var _node = _interopRequireDefault(require("parse/node"));
var _lodash = _interopRequireDefault(require("lodash"));
var _defaults = _interopRequireDefault(require("../../../defaults"));
var _logger = _interopRequireDefault(require("../../../logger"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }
function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }
function _extends() { _extends = Object.assign ? Object.assign.bind() : function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); } // -disable-next
// -disable-next
// -disable-next
const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const ReadPreference = mongodb.ReadPreference;
const MongoSchemaCollectionName = '_SCHEMA';
const storageAdapterAllCollections = mongoAdapter => {
  return mongoAdapter.connect().then(() => mongoAdapter.database.collections()).then(collections => {
    return collections.filter(collection => {
      if (collection.namespace.match(/\.system\./)) {
        return false;
      }
      // TODO: If you have one app with a collection prefix that happens to be a prefix of another
      // apps prefix, this will go very very badly. We should fix that somehow.
      return collection.collectionName.indexOf(mongoAdapter._collectionPrefix) == 0;
    });
  });
};
const convertParseSchemaToMongoSchema = _ref => {
  let schema = _extends({}, _ref);
  delete schema.fields._rperm;
  delete schema.fields._wperm;
  if (schema.className === '_User') {
    // Legacy mongo adapter knows about the difference between password and _hashed_password.
    // Future database adapters will only know about _hashed_password.
    // Note: Parse Server will bring back password with injectDefaultSchema, so we don't need
    // to add _hashed_password back ever.
    delete schema.fields._hashed_password;
  }
  return schema;
};

// Returns { code, error } if invalid, or { result }, an object
// suitable for inserting into _SCHEMA collection, otherwise.
const mongoSchemaFromFieldsAndClassNameAndCLP = (fields, className, classLevelPermissions, indexes) => {
  const mongoObject = {
    _id: className,
    objectId: 'string',
    updatedAt: 'string',
    createdAt: 'string',
    _metadata: undefined
  };
  for (const fieldName in fields) {
    const _fields$fieldName = fields[fieldName],
      {
        type,
        targetClass
      } = _fields$fieldName,
      fieldOptions = _objectWithoutProperties(_fields$fieldName, ["type", "targetClass"]);
    mongoObject[fieldName] = _MongoSchemaCollection.default.parseFieldTypeToMongoFieldType({
      type,
      targetClass
    });
    if (fieldOptions && Object.keys(fieldOptions).length > 0) {
      mongoObject._metadata = mongoObject._metadata || {};
      mongoObject._metadata.fields_options = mongoObject._metadata.fields_options || {};
      mongoObject._metadata.fields_options[fieldName] = fieldOptions;
    }
  }
  if (typeof classLevelPermissions !== 'undefined') {
    mongoObject._metadata = mongoObject._metadata || {};
    if (!classLevelPermissions) {
      delete mongoObject._metadata.class_permissions;
    } else {
      mongoObject._metadata.class_permissions = classLevelPermissions;
    }
  }
  if (indexes && typeof indexes === 'object' && Object.keys(indexes).length > 0) {
    mongoObject._metadata = mongoObject._metadata || {};
    mongoObject._metadata.indexes = indexes;
  }
  if (!mongoObject._metadata) {
    // cleanup the unused _metadata
    delete mongoObject._metadata;
  }
  return mongoObject;
};
function validateExplainValue(explain) {
  if (explain) {
    // The list of allowed explain values is from node-mongodb-native/lib/explain.js
    const explainAllowedValues = ['queryPlanner', 'queryPlannerExtended', 'executionStats', 'allPlansExecution', false, true];
    if (!explainAllowedValues.includes(explain)) {
      throw new _node.default.Error(_node.default.Error.INVALID_QUERY, 'Invalid value for explain');
    }
  }
}
class MongoStorageAdapter {
  // Private

  // Public

  constructor({
    uri = _defaults.default.DefaultMongoURI,
    collectionPrefix = '',
    mongoOptions = {}
  }) {
    this._uri = uri;
    this._collectionPrefix = collectionPrefix;
    this._mongoOptions = _objectSpread({}, mongoOptions);
    this._mongoOptions.useNewUrlParser = true;
    this._mongoOptions.useUnifiedTopology = true;
    this._onchange = () => {};

    // MaxTimeMS is not a global MongoDB client option, it is applied per operation.
    this._maxTimeMS = mongoOptions.maxTimeMS;
    this.canSortOnJoinTables = true;
    this.enableSchemaHooks = !!mongoOptions.enableSchemaHooks;
    this.schemaCacheTtl = mongoOptions.schemaCacheTtl;
    for (const key of ['enableSchemaHooks', 'schemaCacheTtl', 'maxTimeMS']) {
      delete mongoOptions[key];
      delete this._mongoOptions[key];
    }
  }
  watch(callback) {
    this._onchange = callback;
  }
  connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // parsing and re-formatting causes the auth value (if there) to get URI
    // encoded
    const encodedUri = (0, _mongodbUrl.format)((0, _mongodbUrl.parse)(this._uri));
    this.connectionPromise = MongoClient.connect(encodedUri, this._mongoOptions).then(client => {
      // Starting mongoDB 3.0, the MongoClient.connect don't return a DB anymore but a client
      // Fortunately, we can get back the options and use them to select the proper DB.
      // https://github.com/mongodb/node-mongodb-native/blob/2c35d76f08574225b8db02d7bef687123e6bb018/lib/mongo_client.js#L885
      const options = client.s.options;
      const database = client.db(options.dbName);
      if (!database) {
        delete this.connectionPromise;
        return;
      }
      client.on('error', () => {
        delete this.connectionPromise;
      });
      client.on('close', () => {
        delete this.connectionPromise;
      });
      this.client = client;
      this.database = database;
    }).catch(err => {
      delete this.connectionPromise;
      return Promise.reject(err);
    });
    return this.connectionPromise;
  }
  handleError(error) {
    if (error && error.code === 13) {
      // Unauthorized error
      delete this.client;
      delete this.database;
      delete this.connectionPromise;
      _logger.default.error('Received unauthorized error', {
        error: error
      });
    }
    throw error;
  }
  async handleShutdown() {
    if (!this.client) {
      return;
    }
    await this.client.close(false);
    delete this.connectionPromise;
  }
  _adaptiveCollection(name) {
    return this.connect().then(() => this.database.collection(this._collectionPrefix + name)).then(rawCollection => new _MongoCollection.default(rawCollection)).catch(err => this.handleError(err));
  }
  _schemaCollection() {
    return this.connect().then(() => this._adaptiveCollection(MongoSchemaCollectionName)).then(collection => {
      if (!this._stream && this.enableSchemaHooks) {
        this._stream = collection._mongoCollection.watch();
        this._stream.on('change', () => this._onchange());
      }
      return new _MongoSchemaCollection.default(collection);
    });
  }
  classExists(name) {
    return this.connect().then(() => {
      return this.database.listCollections({
        name: this._collectionPrefix + name
      }).toArray();
    }).then(collections => {
      return collections.length > 0;
    }).catch(err => this.handleError(err));
  }
  setClassLevelPermissions(className, CLPs) {
    return this._schemaCollection().then(schemaCollection => schemaCollection.updateSchema(className, {
      $set: {
        '_metadata.class_permissions': CLPs
      }
    })).catch(err => this.handleError(err));
  }
  setIndexesWithSchemaFormat(className, submittedIndexes, existingIndexes = {}, fields) {
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
    const deletePromises = [];
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
        const promise = this.dropIndex(className, name);
        deletePromises.push(promise);
        delete existingIndexes[name];
      } else {
        Object.keys(field).forEach(key => {
          if (!Object.prototype.hasOwnProperty.call(fields, key.indexOf('_p_') === 0 ? key.replace('_p_', '') : key)) {
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
    let insertPromise = Promise.resolve();
    if (insertedIndexes.length > 0) {
      insertPromise = this.createIndexes(className, insertedIndexes);
    }
    return Promise.all(deletePromises).then(() => insertPromise).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.updateSchema(className, {
      $set: {
        '_metadata.indexes': existingIndexes
      }
    })).catch(err => this.handleError(err));
  }
  setIndexesFromMongo(className) {
    return this.getIndexes(className).then(indexes => {
      indexes = indexes.reduce((obj, index) => {
        if (index.key._fts) {
          delete index.key._fts;
          delete index.key._ftsx;
          for (const field in index.weights) {
            index.key[field] = 'text';
          }
        }
        obj[index.name] = index.key;
        return obj;
      }, {});
      return this._schemaCollection().then(schemaCollection => schemaCollection.updateSchema(className, {
        $set: {
          '_metadata.indexes': indexes
        }
      }));
    }).catch(err => this.handleError(err)).catch(() => {
      // Ignore if collection not found
      return Promise.resolve();
    });
  }
  createClass(className, schema) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoObject = mongoSchemaFromFieldsAndClassNameAndCLP(schema.fields, className, schema.classLevelPermissions, schema.indexes);
    mongoObject._id = className;
    return this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.insertSchema(mongoObject)).catch(err => this.handleError(err));
  }
  async updateFieldOptions(className, fieldName, type) {
    const schemaCollection = await this._schemaCollection();
    await schemaCollection.updateFieldOptions(className, fieldName, type);
  }
  addFieldIfNotExists(className, fieldName, type) {
    return this._schemaCollection().then(schemaCollection => schemaCollection.addFieldIfNotExists(className, fieldName, type)).then(() => this.createIndexesIfNeeded(className, fieldName, type)).catch(err => this.handleError(err));
  }

  // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.
  deleteClass(className) {
    return this._adaptiveCollection(className).then(collection => collection.drop()).catch(error => {
      // 'ns not found' means collection was already gone. Ignore deletion attempt.
      if (error.message == 'ns not found') {
        return;
      }
      throw error;
    })
    // We've dropped the collection, now remove the _SCHEMA document
    .then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.findAndDeleteSchema(className)).catch(err => this.handleError(err));
  }
  deleteAllClasses(fast) {
    return storageAdapterAllCollections(this).then(collections => Promise.all(collections.map(collection => fast ? collection.deleteMany({}) : collection.drop())));
  }

  // Remove the column and all the data. For Relations, the _Join collection is handled
  // specially, this function does not delete _Join columns. It should, however, indicate
  // that the relation fields does not exist anymore. In mongo, this means removing it from
  // the _SCHEMA collection.  There should be no actual data in the collection under the same name
  // as the relation column, so it's fine to attempt to delete it. If the fields listed to be
  // deleted do not exist, this function should return successfully anyways. Checking for
  // attempts to delete non-existent fields is the responsibility of Parse Server.

  // Pointer field names are passed for legacy reasons: the original mongo
  // format stored pointer field names differently in the database, and therefore
  // needed to know the type of the field before it could delete it. Future database
  // adapters should ignore the pointerFieldNames argument. All the field names are in
  // fieldNames, they show up additionally in the pointerFieldNames database for use
  // by the mongo adapter, which deals with the legacy mongo format.

  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.

  // Returns a Promise.
  deleteFields(className, schema, fieldNames) {
    const mongoFormatNames = fieldNames.map(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer') {
        return `_p_${fieldName}`;
      } else {
        return fieldName;
      }
    });
    const collectionUpdate = {
      $unset: {}
    };
    mongoFormatNames.forEach(name => {
      collectionUpdate['$unset'][name] = null;
    });
    const collectionFilter = {
      $or: []
    };
    mongoFormatNames.forEach(name => {
      collectionFilter['$or'].push({
        [name]: {
          $exists: true
        }
      });
    });
    const schemaUpdate = {
      $unset: {}
    };
    fieldNames.forEach(name => {
      schemaUpdate['$unset'][name] = null;
      schemaUpdate['$unset'][`_metadata.fields_options.${name}`] = null;
    });
    return this._adaptiveCollection(className).then(collection => collection.updateMany(collectionFilter, collectionUpdate)).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.updateSchema(className, schemaUpdate)).catch(err => this.handleError(err));
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  getAllClasses() {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchAllSchemasFrom_SCHEMA()).catch(err => this.handleError(err));
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  getClass(className) {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchOneSchemaFrom_SCHEMA(className)).catch(err => this.handleError(err));
  }

  // TODO: As yet not particularly well specified. Creates an object. Maybe shouldn't even need the schema,
  // and should infer from the type. Or maybe does need the schema for validations. Or maybe needs
  // the schema only for the legacy mongo format. We'll figure that out later.
  createObject(className, schema, object, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoObject = (0, _MongoTransform.parseObjectToMongoObjectForCreate)(className, object, schema);
    return this._adaptiveCollection(className).then(collection => collection.insertOne(mongoObject, transactionalSession)).then(() => ({
      ops: [mongoObject]
    })).catch(error => {
      if (error.code === 11000) {
        // Duplicate value
        const err = new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        err.underlyingError = error;
        if (error.message) {
          const matches = error.message.match(/index:[\sa-zA-Z0-9_\-\.]+\$?([a-zA-Z_-]+)_1/);
          if (matches && Array.isArray(matches)) {
            err.userInfo = {
              duplicated_field: matches[1]
            };
          }
        }
        throw err;
      }
      throw error;
    }).catch(err => this.handleError(err));
  }

  // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.
  deleteObjectsByQuery(className, schema, query, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    return this._adaptiveCollection(className).then(collection => {
      const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
      return collection.deleteMany(mongoWhere, transactionalSession);
    }).catch(err => this.handleError(err)).then(({
      deletedCount
    }) => {
      if (deletedCount === 0) {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }
      return Promise.resolve();
    }, () => {
      throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'Database adapter error');
    });
  }

  // Apply the update to all objects that match the given Parse Query.
  updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection.updateMany(mongoWhere, mongoUpdate, transactionalSession)).catch(err => this.handleError(err));
  }

  // Atomically finds and updates an object based on query.
  // Return value not currently well specified.
  findOneAndUpdate(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.findOneAndUpdate(mongoWhere, mongoUpdate, {
      returnDocument: 'after',
      session: transactionalSession || undefined
    })).then(result => (0, _MongoTransform.mongoObjectToParseObject)(className, result.value, schema)).catch(error => {
      if (error.code === 11000) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      }
      throw error;
    }).catch(err => this.handleError(err));
  }

  // Hopefully we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection.upsertOne(mongoWhere, mongoUpdate, transactionalSession)).catch(err => this.handleError(err));
  }

  // Executes a find. Accepts: className, query in Parse format, and { skip, limit, sort }.
  find(className, schema, query, {
    skip,
    limit,
    sort,
    keys,
    readPreference,
    hint,
    caseInsensitive,
    explain,
    comment
  }) {
    validateExplainValue(explain);
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    const mongoSort = _lodash.default.mapKeys(sort, (value, fieldName) => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    const mongoKeys = _lodash.default.reduce(keys, (memo, key) => {
      if (key === 'ACL') {
        memo['_rperm'] = 1;
        memo['_wperm'] = 1;
      } else {
        memo[(0, _MongoTransform.transformKey)(className, key, schema)] = 1;
      }
      return memo;
    }, {});

    // If we aren't requesting the `_id` field, we need to explicitly opt out
    // of it. Doing so in parse-server is unusual, but it can allow us to
    // optimize some queries with covering indexes.
    if (keys && !mongoKeys._id) {
      mongoKeys._id = 0;
    }
    readPreference = this._parseReadPreference(readPreference);
    return this.createTextIndexesIfNeeded(className, query, schema).then(() => this._adaptiveCollection(className)).then(collection => collection.find(mongoWhere, {
      skip,
      limit,
      sort: mongoSort,
      keys: mongoKeys,
      maxTimeMS: this._maxTimeMS,
      readPreference,
      hint,
      caseInsensitive,
      explain,
      comment
    })).then(objects => {
      if (explain) {
        return objects;
      }
      return objects.map(object => (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema));
    }).catch(err => this.handleError(err));
  }
  ensureIndex(className, schema, fieldNames, indexName, caseInsensitive = false, options = {}) {
    schema = convertParseSchemaToMongoSchema(schema);
    const indexCreationRequest = {};
    const mongoFieldNames = fieldNames.map(fieldName => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = options.indexType !== undefined ? options.indexType : 1;
    });
    const defaultOptions = {
      background: true,
      sparse: true
    };
    const indexNameOptions = indexName ? {
      name: indexName
    } : {};
    const ttlOptions = options.ttl !== undefined ? {
      expireAfterSeconds: options.ttl
    } : {};
    const caseInsensitiveOptions = caseInsensitive ? {
      collation: _MongoCollection.default.caseInsensitiveCollation()
    } : {};
    const indexOptions = _objectSpread(_objectSpread(_objectSpread(_objectSpread({}, defaultOptions), caseInsensitiveOptions), indexNameOptions), ttlOptions);
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.createIndex(indexCreationRequest, indexOptions)).catch(err => this.handleError(err));
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  ensureUniqueness(className, schema, fieldNames) {
    schema = convertParseSchemaToMongoSchema(schema);
    const indexCreationRequest = {};
    const mongoFieldNames = fieldNames.map(fieldName => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = 1;
    });
    return this._adaptiveCollection(className).then(collection => collection._ensureSparseUniqueIndexInBackground(indexCreationRequest)).catch(error => {
      if (error.code === 11000) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'Tried to ensure field uniqueness for a class that already has duplicates.');
      }
      throw error;
    }).catch(err => this.handleError(err));
  }

  // Used in tests
  _rawFind(className, query) {
    return this._adaptiveCollection(className).then(collection => collection.find(query, {
      maxTimeMS: this._maxTimeMS
    })).catch(err => this.handleError(err));
  }

  // Executes a count.
  count(className, schema, query, readPreference, _estimate, hint, comment) {
    schema = convertParseSchemaToMongoSchema(schema);
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className).then(collection => collection.count((0, _MongoTransform.transformWhere)(className, query, schema, true), {
      maxTimeMS: this._maxTimeMS,
      readPreference,
      hint,
      comment
    })).catch(err => this.handleError(err));
  }
  distinct(className, schema, query, fieldName) {
    schema = convertParseSchemaToMongoSchema(schema);
    const isPointerField = schema.fields[fieldName] && schema.fields[fieldName].type === 'Pointer';
    const transformField = (0, _MongoTransform.transformKey)(className, fieldName, schema);
    return this._adaptiveCollection(className).then(collection => collection.distinct(transformField, (0, _MongoTransform.transformWhere)(className, query, schema))).then(objects => {
      objects = objects.filter(obj => obj != null);
      return objects.map(object => {
        if (isPointerField) {
          return (0, _MongoTransform.transformPointerString)(schema, fieldName, object);
        }
        return (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema);
      });
    }).catch(err => this.handleError(err));
  }
  aggregate(className, schema, pipeline, readPreference, hint, explain, comment) {
    validateExplainValue(explain);
    let isPointerField = false;
    pipeline = pipeline.map(stage => {
      if (stage.$group) {
        stage.$group = this._parseAggregateGroupArgs(schema, stage.$group);
        if (stage.$group._id && typeof stage.$group._id === 'string' && stage.$group._id.indexOf('$_p_') >= 0) {
          isPointerField = true;
        }
      }
      if (stage.$match) {
        stage.$match = this._parseAggregateArgs(schema, stage.$match);
      }
      if (stage.$project) {
        stage.$project = this._parseAggregateProjectArgs(schema, stage.$project);
      }
      if (stage.$geoNear && stage.$geoNear.query) {
        stage.$geoNear.query = this._parseAggregateArgs(schema, stage.$geoNear.query);
      }
      return stage;
    });
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className).then(collection => collection.aggregate(pipeline, {
      readPreference,
      maxTimeMS: this._maxTimeMS,
      hint,
      explain,
      comment
    })).then(results => {
      results.forEach(result => {
        if (Object.prototype.hasOwnProperty.call(result, '_id')) {
          if (isPointerField && result._id) {
            result._id = result._id.split('$')[1];
          }
          if (result._id == null || result._id == undefined || ['object', 'string'].includes(typeof result._id) && _lodash.default.isEmpty(result._id)) {
            result._id = null;
          }
          result.objectId = result._id;
          delete result._id;
        }
      });
      return results;
    }).then(objects => objects.map(object => (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema))).catch(err => this.handleError(err));
  }

  // This function will recursively traverse the pipeline and convert any Pointer or Date columns.
  // If we detect a pointer column we will rename the column being queried for to match the column
  // in the database. We also modify the value to what we expect the value to be in the database
  // as well.
  // For dates, the driver expects a Date object, but we have a string coming in. So we'll convert
  // the string to a Date so the driver can perform the necessary comparison.
  //
  // The goal of this method is to look for the "leaves" of the pipeline and determine if it needs
  // to be converted. The pipeline can have a few different forms. For more details, see:
  //     https://docs.mongodb.com/manual/reference/operator/aggregation/
  //
  // If the pipeline is an array, it means we are probably parsing an '$and' or '$or' operator. In
  // that case we need to loop through all of it's children to find the columns being operated on.
  // If the pipeline is an object, then we'll loop through the keys checking to see if the key name
  // matches one of the schema columns. If it does match a column and the column is a Pointer or
  // a Date, then we'll convert the value as described above.
  //
  // As much as I hate recursion...this seemed like a good fit for it. We're essentially traversing
  // down a tree to find a "leaf node" and checking to see if it needs to be converted.
  _parseAggregateArgs(schema, pipeline) {
    if (pipeline === null) {
      return null;
    } else if (Array.isArray(pipeline)) {
      return pipeline.map(value => this._parseAggregateArgs(schema, value));
    } else if (typeof pipeline === 'object') {
      const returnValue = {};
      for (const field in pipeline) {
        if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
          if (typeof pipeline[field] === 'object') {
            // Pass objects down to MongoDB...this is more than likely an $exists operator.
            returnValue[`_p_${field}`] = pipeline[field];
          } else {
            returnValue[`_p_${field}`] = `${schema.fields[field].targetClass}$${pipeline[field]}`;
          }
        } else if (schema.fields[field] && schema.fields[field].type === 'Date') {
          returnValue[field] = this._convertToDate(pipeline[field]);
        } else {
          returnValue[field] = this._parseAggregateArgs(schema, pipeline[field]);
        }
        if (field === 'objectId') {
          returnValue['_id'] = returnValue[field];
          delete returnValue[field];
        } else if (field === 'createdAt') {
          returnValue['_created_at'] = returnValue[field];
          delete returnValue[field];
        } else if (field === 'updatedAt') {
          returnValue['_updated_at'] = returnValue[field];
          delete returnValue[field];
        }
      }
      return returnValue;
    }
    return pipeline;
  }

  // This function is slightly different than the one above. Rather than trying to combine these
  // two functions and making the code even harder to understand, I decided to split it up. The
  // difference with this function is we are not transforming the values, only the keys of the
  // pipeline.
  _parseAggregateProjectArgs(schema, pipeline) {
    const returnValue = {};
    for (const field in pipeline) {
      if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
        returnValue[`_p_${field}`] = pipeline[field];
      } else {
        returnValue[field] = this._parseAggregateArgs(schema, pipeline[field]);
      }
      if (field === 'objectId') {
        returnValue['_id'] = returnValue[field];
        delete returnValue[field];
      } else if (field === 'createdAt') {
        returnValue['_created_at'] = returnValue[field];
        delete returnValue[field];
      } else if (field === 'updatedAt') {
        returnValue['_updated_at'] = returnValue[field];
        delete returnValue[field];
      }
    }
    return returnValue;
  }

  // This function is slightly different than the two above. MongoDB $group aggregate looks like:
  //     { $group: { _id: <expression>, <field1>: { <accumulator1> : <expression1> }, ... } }
  // The <expression> could be a column name, prefixed with the '$' character. We'll look for
  // these <expression> and check to see if it is a 'Pointer' or if it's one of createdAt,
  // updatedAt or objectId and change it accordingly.
  _parseAggregateGroupArgs(schema, pipeline) {
    if (Array.isArray(pipeline)) {
      return pipeline.map(value => this._parseAggregateGroupArgs(schema, value));
    } else if (typeof pipeline === 'object') {
      const returnValue = {};
      for (const field in pipeline) {
        returnValue[field] = this._parseAggregateGroupArgs(schema, pipeline[field]);
      }
      return returnValue;
    } else if (typeof pipeline === 'string') {
      const field = pipeline.substring(1);
      if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
        return `$_p_${field}`;
      } else if (field == 'createdAt') {
        return '$_created_at';
      } else if (field == 'updatedAt') {
        return '$_updated_at';
      }
    }
    return pipeline;
  }

  // This function will attempt to convert the provided value to a Date object. Since this is part
  // of an aggregation pipeline, the value can either be a string or it can be another object with
  // an operator in it (like $gt, $lt, etc). Because of this I felt it was easier to make this a
  // recursive method to traverse down to the "leaf node" which is going to be the string.
  _convertToDate(value) {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string') {
      return new Date(value);
    }
    const returnValue = {};
    for (const field in value) {
      returnValue[field] = this._convertToDate(value[field]);
    }
    return returnValue;
  }
  _parseReadPreference(readPreference) {
    if (readPreference) {
      readPreference = readPreference.toUpperCase();
    }
    switch (readPreference) {
      case 'PRIMARY':
        readPreference = ReadPreference.PRIMARY;
        break;
      case 'PRIMARY_PREFERRED':
        readPreference = ReadPreference.PRIMARY_PREFERRED;
        break;
      case 'SECONDARY':
        readPreference = ReadPreference.SECONDARY;
        break;
      case 'SECONDARY_PREFERRED':
        readPreference = ReadPreference.SECONDARY_PREFERRED;
        break;
      case 'NEAREST':
        readPreference = ReadPreference.NEAREST;
        break;
      case undefined:
      case null:
      case '':
        break;
      default:
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, 'Not supported read preference.');
    }
    return readPreference;
  }
  performInitialization() {
    return Promise.resolve();
  }
  createIndex(className, index) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.createIndex(index)).catch(err => this.handleError(err));
  }
  createIndexes(className, indexes) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.createIndexes(indexes)).catch(err => this.handleError(err));
  }
  createIndexesIfNeeded(className, fieldName, type) {
    if (type && type.type === 'Polygon') {
      const index = {
        [fieldName]: '2dsphere'
      };
      return this.createIndex(className, index);
    }
    return Promise.resolve();
  }
  createTextIndexesIfNeeded(className, query, schema) {
    for (const fieldName in query) {
      if (!query[fieldName] || !query[fieldName].$text) {
        continue;
      }
      const existingIndexes = schema.indexes;
      for (const key in existingIndexes) {
        const index = existingIndexes[key];
        if (Object.prototype.hasOwnProperty.call(index, fieldName)) {
          return Promise.resolve();
        }
      }
      const indexName = `${fieldName}_text`;
      const textIndex = {
        [indexName]: {
          [fieldName]: 'text'
        }
      };
      return this.setIndexesWithSchemaFormat(className, textIndex, existingIndexes, schema.fields).catch(error => {
        if (error.code === 85) {
          // Index exist with different options
          return this.setIndexesFromMongo(className);
        }
        throw error;
      });
    }
    return Promise.resolve();
  }
  getIndexes(className) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.indexes()).catch(err => this.handleError(err));
  }
  dropIndex(className, index) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.dropIndex(index)).catch(err => this.handleError(err));
  }
  dropAllIndexes(className) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.dropIndexes()).catch(err => this.handleError(err));
  }
  updateSchemaWithIndexes() {
    return this.getAllClasses().then(classes => {
      const promises = classes.map(schema => {
        return this.setIndexesFromMongo(schema.className);
      });
      return Promise.all(promises);
    }).catch(err => this.handleError(err));
  }
  createTransactionalSession() {
    const transactionalSection = this.client.startSession();
    transactionalSection.startTransaction();
    return Promise.resolve(transactionalSection);
  }
  commitTransactionalSession(transactionalSection) {
    const commit = retries => {
      return transactionalSection.commitTransaction().catch(error => {
        if (error && error.hasErrorLabel('TransientTransactionError') && retries > 0) {
          return commit(retries - 1);
        }
        throw error;
      }).then(() => {
        transactionalSection.endSession();
      });
    };
    return commit(5);
  }
  abortTransactionalSession(transactionalSection) {
    return transactionalSection.abortTransaction().then(() => {
      transactionalSection.endSession();
    });
  }
}
exports.MongoStorageAdapter = MongoStorageAdapter;
var _default = exports.default = MongoStorageAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfTW9uZ29Db2xsZWN0aW9uIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfTW9uZ29TY2hlbWFDb2xsZWN0aW9uIiwiX1N0b3JhZ2VBZGFwdGVyIiwiX21vbmdvZGJVcmwiLCJfTW9uZ29UcmFuc2Zvcm0iLCJfbm9kZSIsIl9sb2Rhc2giLCJfZGVmYXVsdHMiLCJfbG9nZ2VyIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwiZSIsInIiLCJ0IiwiT2JqZWN0Iiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5Iiwia2V5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiaSIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIl9vYmplY3RXaXRob3V0UHJvcGVydGllcyIsInNvdXJjZSIsImV4Y2x1ZGVkIiwidGFyZ2V0IiwiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzTG9vc2UiLCJzb3VyY2VTeW1ib2xLZXlzIiwiaW5kZXhPZiIsInByb3RvdHlwZSIsInByb3BlcnR5SXNFbnVtZXJhYmxlIiwic291cmNlS2V5cyIsIl9leHRlbmRzIiwiYXNzaWduIiwiYmluZCIsImhhc093blByb3BlcnR5IiwibW9uZ29kYiIsIk1vbmdvQ2xpZW50IiwiUmVhZFByZWZlcmVuY2UiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lIiwic3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyIsIm1vbmdvQWRhcHRlciIsImNvbm5lY3QiLCJ0aGVuIiwiZGF0YWJhc2UiLCJjb2xsZWN0aW9ucyIsImNvbGxlY3Rpb24iLCJuYW1lc3BhY2UiLCJtYXRjaCIsImNvbGxlY3Rpb25OYW1lIiwiX2NvbGxlY3Rpb25QcmVmaXgiLCJjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hIiwiX3JlZiIsInNjaGVtYSIsImZpZWxkcyIsIl9ycGVybSIsIl93cGVybSIsImNsYXNzTmFtZSIsIl9oYXNoZWRfcGFzc3dvcmQiLCJtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwibW9uZ29PYmplY3QiLCJfaWQiLCJvYmplY3RJZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsIl9tZXRhZGF0YSIsInVuZGVmaW5lZCIsImZpZWxkTmFtZSIsIl9maWVsZHMkZmllbGROYW1lIiwidHlwZSIsInRhcmdldENsYXNzIiwiZmllbGRPcHRpb25zIiwiTW9uZ29TY2hlbWFDb2xsZWN0aW9uIiwicGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlIiwiZmllbGRzX29wdGlvbnMiLCJjbGFzc19wZXJtaXNzaW9ucyIsInZhbGlkYXRlRXhwbGFpblZhbHVlIiwiZXhwbGFpbiIsImV4cGxhaW5BbGxvd2VkVmFsdWVzIiwiaW5jbHVkZXMiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9RVUVSWSIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsInVyaSIsImRlZmF1bHRzIiwiRGVmYXVsdE1vbmdvVVJJIiwiY29sbGVjdGlvblByZWZpeCIsIm1vbmdvT3B0aW9ucyIsIl91cmkiLCJfbW9uZ29PcHRpb25zIiwidXNlTmV3VXJsUGFyc2VyIiwidXNlVW5pZmllZFRvcG9sb2d5IiwiX29uY2hhbmdlIiwiX21heFRpbWVNUyIsIm1heFRpbWVNUyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJlbmFibGVTY2hlbWFIb29rcyIsInNjaGVtYUNhY2hlVHRsIiwid2F0Y2giLCJjYWxsYmFjayIsImNvbm5lY3Rpb25Qcm9taXNlIiwiZW5jb2RlZFVyaSIsImZvcm1hdFVybCIsInBhcnNlVXJsIiwiY2xpZW50Iiwib3B0aW9ucyIsInMiLCJkYiIsImRiTmFtZSIsIm9uIiwiY2F0Y2giLCJlcnIiLCJQcm9taXNlIiwicmVqZWN0IiwiaGFuZGxlRXJyb3IiLCJlcnJvciIsImNvZGUiLCJsb2dnZXIiLCJoYW5kbGVTaHV0ZG93biIsImNsb3NlIiwiX2FkYXB0aXZlQ29sbGVjdGlvbiIsIm5hbWUiLCJyYXdDb2xsZWN0aW9uIiwiTW9uZ29Db2xsZWN0aW9uIiwiX3NjaGVtYUNvbGxlY3Rpb24iLCJfc3RyZWFtIiwiX21vbmdvQ29sbGVjdGlvbiIsImNsYXNzRXhpc3RzIiwibGlzdENvbGxlY3Rpb25zIiwidG9BcnJheSIsInNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIkNMUHMiLCJzY2hlbWFDb2xsZWN0aW9uIiwidXBkYXRlU2NoZW1hIiwiJHNldCIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0Iiwic3VibWl0dGVkSW5kZXhlcyIsImV4aXN0aW5nSW5kZXhlcyIsInJlc29sdmUiLCJfaWRfIiwiZGVsZXRlUHJvbWlzZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJmaWVsZCIsIl9fb3AiLCJwcm9taXNlIiwiZHJvcEluZGV4IiwicmVwbGFjZSIsImluc2VydFByb21pc2UiLCJjcmVhdGVJbmRleGVzIiwiYWxsIiwic2V0SW5kZXhlc0Zyb21Nb25nbyIsImdldEluZGV4ZXMiLCJyZWR1Y2UiLCJpbmRleCIsIl9mdHMiLCJfZnRzeCIsIndlaWdodHMiLCJjcmVhdGVDbGFzcyIsImluc2VydFNjaGVtYSIsInVwZGF0ZUZpZWxkT3B0aW9ucyIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJjcmVhdGVJbmRleGVzSWZOZWVkZWQiLCJkZWxldGVDbGFzcyIsImRyb3AiLCJtZXNzYWdlIiwiZmluZEFuZERlbGV0ZVNjaGVtYSIsImRlbGV0ZUFsbENsYXNzZXMiLCJmYXN0IiwibWFwIiwiZGVsZXRlTWFueSIsImRlbGV0ZUZpZWxkcyIsImZpZWxkTmFtZXMiLCJtb25nb0Zvcm1hdE5hbWVzIiwiY29sbGVjdGlvblVwZGF0ZSIsIiR1bnNldCIsImNvbGxlY3Rpb25GaWx0ZXIiLCIkb3IiLCIkZXhpc3RzIiwic2NoZW1hVXBkYXRlIiwidXBkYXRlTWFueSIsImdldEFsbENsYXNzZXMiLCJzY2hlbWFzQ29sbGVjdGlvbiIsIl9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSIsImdldENsYXNzIiwiX2ZldGNoT25lU2NoZW1hRnJvbV9TQ0hFTUEiLCJjcmVhdGVPYmplY3QiLCJvYmplY3QiLCJ0cmFuc2FjdGlvbmFsU2Vzc2lvbiIsInBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSIsImluc2VydE9uZSIsIm9wcyIsIkRVUExJQ0FURV9WQUxVRSIsInVuZGVybHlpbmdFcnJvciIsIm1hdGNoZXMiLCJBcnJheSIsImlzQXJyYXkiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJkZWxldGVPYmplY3RzQnlRdWVyeSIsInF1ZXJ5IiwibW9uZ29XaGVyZSIsInRyYW5zZm9ybVdoZXJlIiwiZGVsZXRlZENvdW50IiwiT0JKRUNUX05PVF9GT1VORCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBkYXRlIiwibW9uZ29VcGRhdGUiLCJ0cmFuc2Zvcm1VcGRhdGUiLCJmaW5kT25lQW5kVXBkYXRlIiwicmV0dXJuRG9jdW1lbnQiLCJzZXNzaW9uIiwicmVzdWx0IiwibW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0IiwidXBzZXJ0T25lT2JqZWN0IiwidXBzZXJ0T25lIiwiZmluZCIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJyZWFkUHJlZmVyZW5jZSIsImhpbnQiLCJjYXNlSW5zZW5zaXRpdmUiLCJjb21tZW50IiwibW9uZ29Tb3J0IiwiXyIsIm1hcEtleXMiLCJ0cmFuc2Zvcm1LZXkiLCJtb25nb0tleXMiLCJtZW1vIiwiX3BhcnNlUmVhZFByZWZlcmVuY2UiLCJjcmVhdGVUZXh0SW5kZXhlc0lmTmVlZGVkIiwib2JqZWN0cyIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiaW5kZXhDcmVhdGlvblJlcXVlc3QiLCJtb25nb0ZpZWxkTmFtZXMiLCJpbmRleFR5cGUiLCJkZWZhdWx0T3B0aW9ucyIsImJhY2tncm91bmQiLCJzcGFyc2UiLCJpbmRleE5hbWVPcHRpb25zIiwidHRsT3B0aW9ucyIsInR0bCIsImV4cGlyZUFmdGVyU2Vjb25kcyIsImNhc2VJbnNlbnNpdGl2ZU9wdGlvbnMiLCJjb2xsYXRpb24iLCJjYXNlSW5zZW5zaXRpdmVDb2xsYXRpb24iLCJpbmRleE9wdGlvbnMiLCJjcmVhdGVJbmRleCIsImVuc3VyZVVuaXF1ZW5lc3MiLCJfZW5zdXJlU3BhcnNlVW5pcXVlSW5kZXhJbkJhY2tncm91bmQiLCJfcmF3RmluZCIsImNvdW50IiwiX2VzdGltYXRlIiwiZGlzdGluY3QiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybUZpZWxkIiwidHJhbnNmb3JtUG9pbnRlclN0cmluZyIsImFnZ3JlZ2F0ZSIsInBpcGVsaW5lIiwic3RhZ2UiLCIkZ3JvdXAiLCJfcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3MiLCIkbWF0Y2giLCJfcGFyc2VBZ2dyZWdhdGVBcmdzIiwiJHByb2plY3QiLCJfcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyIsIiRnZW9OZWFyIiwicmVzdWx0cyIsInNwbGl0IiwiaXNFbXB0eSIsInJldHVyblZhbHVlIiwiX2NvbnZlcnRUb0RhdGUiLCJzdWJzdHJpbmciLCJEYXRlIiwidG9VcHBlckNhc2UiLCJQUklNQVJZIiwiUFJJTUFSWV9QUkVGRVJSRUQiLCJTRUNPTkRBUlkiLCJTRUNPTkRBUllfUFJFRkVSUkVEIiwiTkVBUkVTVCIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsIiR0ZXh0IiwidGV4dEluZGV4IiwiZHJvcEFsbEluZGV4ZXMiLCJkcm9wSW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwiY2xhc3NlcyIsInByb21pc2VzIiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJ0cmFuc2FjdGlvbmFsU2VjdGlvbiIsInN0YXJ0U2Vzc2lvbiIsInN0YXJ0VHJhbnNhY3Rpb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdCIsInJldHJpZXMiLCJjb21taXRUcmFuc2FjdGlvbiIsImhhc0Vycm9yTGFiZWwiLCJlbmRTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb24iLCJleHBvcnRzIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1N0b3JhZ2VBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgTW9uZ29Db2xsZWN0aW9uIGZyb20gJy4vTW9uZ29Db2xsZWN0aW9uJztcbmltcG9ydCBNb25nb1NjaGVtYUNvbGxlY3Rpb24gZnJvbSAnLi9Nb25nb1NjaGVtYUNvbGxlY3Rpb24nO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgU3RvcmFnZUNsYXNzLCBRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZVVybCwgZm9ybWF0IGFzIGZvcm1hdFVybCB9IGZyb20gJy4uLy4uLy4uL3ZlbmRvci9tb25nb2RiVXJsJztcbmltcG9ydCB7XG4gIHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSxcbiAgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0LFxuICB0cmFuc2Zvcm1LZXksXG4gIHRyYW5zZm9ybVdoZXJlLFxuICB0cmFuc2Zvcm1VcGRhdGUsXG4gIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcsXG59IGZyb20gJy4vTW9uZ29UcmFuc2Zvcm0nO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vLi4vZGVmYXVsdHMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi8uLi9sb2dnZXInO1xuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmNvbnN0IG1vbmdvZGIgPSByZXF1aXJlKCdtb25nb2RiJyk7XG5jb25zdCBNb25nb0NsaWVudCA9IG1vbmdvZGIuTW9uZ29DbGllbnQ7XG5jb25zdCBSZWFkUHJlZmVyZW5jZSA9IG1vbmdvZGIuUmVhZFByZWZlcmVuY2U7XG5cbmNvbnN0IE1vbmdvU2NoZW1hQ29sbGVjdGlvbk5hbWUgPSAnX1NDSEVNQSc7XG5cbmNvbnN0IHN0b3JhZ2VBZGFwdGVyQWxsQ29sbGVjdGlvbnMgPSBtb25nb0FkYXB0ZXIgPT4ge1xuICByZXR1cm4gbW9uZ29BZGFwdGVyXG4gICAgLmNvbm5lY3QoKVxuICAgIC50aGVuKCgpID0+IG1vbmdvQWRhcHRlci5kYXRhYmFzZS5jb2xsZWN0aW9ucygpKVxuICAgIC50aGVuKGNvbGxlY3Rpb25zID0+IHtcbiAgICAgIHJldHVybiBjb2xsZWN0aW9ucy5maWx0ZXIoY29sbGVjdGlvbiA9PiB7XG4gICAgICAgIGlmIChjb2xsZWN0aW9uLm5hbWVzcGFjZS5tYXRjaCgvXFwuc3lzdGVtXFwuLykpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVE9ETzogSWYgeW91IGhhdmUgb25lIGFwcCB3aXRoIGEgY29sbGVjdGlvbiBwcmVmaXggdGhhdCBoYXBwZW5zIHRvIGJlIGEgcHJlZml4IG9mIGFub3RoZXJcbiAgICAgICAgLy8gYXBwcyBwcmVmaXgsIHRoaXMgd2lsbCBnbyB2ZXJ5IHZlcnkgYmFkbHkuIFdlIHNob3VsZCBmaXggdGhhdCBzb21laG93LlxuICAgICAgICByZXR1cm4gY29sbGVjdGlvbi5jb2xsZWN0aW9uTmFtZS5pbmRleE9mKG1vbmdvQWRhcHRlci5fY29sbGVjdGlvblByZWZpeCkgPT0gMDtcbiAgICAgIH0pO1xuICAgIH0pO1xufTtcblxuY29uc3QgY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYSA9ICh7IC4uLnNjaGVtYSB9KSA9PiB7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgLy8gTGVnYWN5IG1vbmdvIGFkYXB0ZXIga25vd3MgYWJvdXQgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiBwYXNzd29yZCBhbmQgX2hhc2hlZF9wYXNzd29yZC5cbiAgICAvLyBGdXR1cmUgZGF0YWJhc2UgYWRhcHRlcnMgd2lsbCBvbmx5IGtub3cgYWJvdXQgX2hhc2hlZF9wYXNzd29yZC5cbiAgICAvLyBOb3RlOiBQYXJzZSBTZXJ2ZXIgd2lsbCBicmluZyBiYWNrIHBhc3N3b3JkIHdpdGggaW5qZWN0RGVmYXVsdFNjaGVtYSwgc28gd2UgZG9uJ3QgbmVlZFxuICAgIC8vIHRvIGFkZCBfaGFzaGVkX3Bhc3N3b3JkIGJhY2sgZXZlci5cbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkO1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbi8vIFJldHVybnMgeyBjb2RlLCBlcnJvciB9IGlmIGludmFsaWQsIG9yIHsgcmVzdWx0IH0sIGFuIG9iamVjdFxuLy8gc3VpdGFibGUgZm9yIGluc2VydGluZyBpbnRvIF9TQ0hFTUEgY29sbGVjdGlvbiwgb3RoZXJ3aXNlLlxuY29uc3QgbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lQW5kQ0xQID0gKFxuICBmaWVsZHMsXG4gIGNsYXNzTmFtZSxcbiAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICBpbmRleGVzXG4pID0+IHtcbiAgY29uc3QgbW9uZ29PYmplY3QgPSB7XG4gICAgX2lkOiBjbGFzc05hbWUsXG4gICAgb2JqZWN0SWQ6ICdzdHJpbmcnLFxuICAgIHVwZGF0ZWRBdDogJ3N0cmluZycsXG4gICAgY3JlYXRlZEF0OiAnc3RyaW5nJyxcbiAgICBfbWV0YWRhdGE6IHVuZGVmaW5lZCxcbiAgfTtcblxuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBmaWVsZHMpIHtcbiAgICBjb25zdCB7IHR5cGUsIHRhcmdldENsYXNzLCAuLi5maWVsZE9wdGlvbnMgfSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgIG1vbmdvT2JqZWN0W2ZpZWxkTmFtZV0gPSBNb25nb1NjaGVtYUNvbGxlY3Rpb24ucGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlKHtcbiAgICAgIHR5cGUsXG4gICAgICB0YXJnZXRDbGFzcyxcbiAgICB9KTtcbiAgICBpZiAoZmllbGRPcHRpb25zICYmIE9iamVjdC5rZXlzKGZpZWxkT3B0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zID0gbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zIHx8IHt9O1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zW2ZpZWxkTmFtZV0gPSBmaWVsZE9wdGlvbnM7XG4gICAgfVxuICB9XG5cbiAgaWYgKHR5cGVvZiBjbGFzc0xldmVsUGVybWlzc2lvbnMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgIGlmICghY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgICBkZWxldGUgbW9uZ29PYmplY3QuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zO1xuICAgIH0gZWxzZSB7XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnMgPSBjbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgfVxuICB9XG5cbiAgaWYgKGluZGV4ZXMgJiYgdHlwZW9mIGluZGV4ZXMgPT09ICdvYmplY3QnICYmIE9iamVjdC5rZXlzKGluZGV4ZXMpLmxlbmd0aCA+IDApIHtcbiAgICBtb25nb09iamVjdC5fbWV0YWRhdGEgPSBtb25nb09iamVjdC5fbWV0YWRhdGEgfHwge307XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmluZGV4ZXMgPSBpbmRleGVzO1xuICB9XG5cbiAgaWYgKCFtb25nb09iamVjdC5fbWV0YWRhdGEpIHtcbiAgICAvLyBjbGVhbnVwIHRoZSB1bnVzZWQgX21ldGFkYXRhXG4gICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YTtcbiAgfVxuXG4gIHJldHVybiBtb25nb09iamVjdDtcbn07XG5cbmZ1bmN0aW9uIHZhbGlkYXRlRXhwbGFpblZhbHVlKGV4cGxhaW4pIHtcbiAgaWYgKGV4cGxhaW4pIHtcbiAgICAvLyBUaGUgbGlzdCBvZiBhbGxvd2VkIGV4cGxhaW4gdmFsdWVzIGlzIGZyb20gbm9kZS1tb25nb2RiLW5hdGl2ZS9saWIvZXhwbGFpbi5qc1xuICAgIGNvbnN0IGV4cGxhaW5BbGxvd2VkVmFsdWVzID0gW1xuICAgICAgJ3F1ZXJ5UGxhbm5lcicsXG4gICAgICAncXVlcnlQbGFubmVyRXh0ZW5kZWQnLFxuICAgICAgJ2V4ZWN1dGlvblN0YXRzJyxcbiAgICAgICdhbGxQbGFuc0V4ZWN1dGlvbicsXG4gICAgICBmYWxzZSxcbiAgICAgIHRydWUsXG4gICAgXTtcbiAgICBpZiAoIWV4cGxhaW5BbGxvd2VkVmFsdWVzLmluY2x1ZGVzKGV4cGxhaW4pKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0ludmFsaWQgdmFsdWUgZm9yIGV4cGxhaW4nKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vbmdvU3RvcmFnZUFkYXB0ZXIgaW1wbGVtZW50cyBTdG9yYWdlQWRhcHRlciB7XG4gIC8vIFByaXZhdGVcbiAgX3VyaTogc3RyaW5nO1xuICBfY29sbGVjdGlvblByZWZpeDogc3RyaW5nO1xuICBfbW9uZ29PcHRpb25zOiBPYmplY3Q7XG4gIF9vbmNoYW5nZTogYW55O1xuICBfc3RyZWFtOiBhbnk7XG4gIC8vIFB1YmxpY1xuICBjb25uZWN0aW9uUHJvbWlzZTogP1Byb21pc2U8YW55PjtcbiAgZGF0YWJhc2U6IGFueTtcbiAgY2xpZW50OiBNb25nb0NsaWVudDtcbiAgX21heFRpbWVNUzogP251bWJlcjtcbiAgY2FuU29ydE9uSm9pblRhYmxlczogYm9vbGVhbjtcbiAgZW5hYmxlU2NoZW1hSG9va3M6IGJvb2xlYW47XG4gIHNjaGVtYUNhY2hlVHRsOiA/bnVtYmVyO1xuXG4gIGNvbnN0cnVjdG9yKHsgdXJpID0gZGVmYXVsdHMuRGVmYXVsdE1vbmdvVVJJLCBjb2xsZWN0aW9uUHJlZml4ID0gJycsIG1vbmdvT3B0aW9ucyA9IHt9IH06IGFueSkge1xuICAgIHRoaXMuX3VyaSA9IHVyaTtcbiAgICB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ID0gY29sbGVjdGlvblByZWZpeDtcbiAgICB0aGlzLl9tb25nb09wdGlvbnMgPSB7IC4uLm1vbmdvT3B0aW9ucyB9O1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucy51c2VOZXdVcmxQYXJzZXIgPSB0cnVlO1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucy51c2VVbmlmaWVkVG9wb2xvZ3kgPSB0cnVlO1xuICAgIHRoaXMuX29uY2hhbmdlID0gKCkgPT4ge307XG5cbiAgICAvLyBNYXhUaW1lTVMgaXMgbm90IGEgZ2xvYmFsIE1vbmdvREIgY2xpZW50IG9wdGlvbiwgaXQgaXMgYXBwbGllZCBwZXIgb3BlcmF0aW9uLlxuICAgIHRoaXMuX21heFRpbWVNUyA9IG1vbmdvT3B0aW9ucy5tYXhUaW1lTVM7XG4gICAgdGhpcy5jYW5Tb3J0T25Kb2luVGFibGVzID0gdHJ1ZTtcbiAgICB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzID0gISFtb25nb09wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3M7XG4gICAgdGhpcy5zY2hlbWFDYWNoZVR0bCA9IG1vbmdvT3B0aW9ucy5zY2hlbWFDYWNoZVR0bDtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBbJ2VuYWJsZVNjaGVtYUhvb2tzJywgJ3NjaGVtYUNhY2hlVHRsJywgJ21heFRpbWVNUyddKSB7XG4gICAgICBkZWxldGUgbW9uZ29PcHRpb25zW2tleV07XG4gICAgICBkZWxldGUgdGhpcy5fbW9uZ29PcHRpb25zW2tleV07XG4gICAgfVxuICB9XG5cbiAgd2F0Y2goY2FsbGJhY2s6ICgpID0+IHZvaWQpOiB2b2lkIHtcbiAgICB0aGlzLl9vbmNoYW5nZSA9IGNhbGxiYWNrO1xuICB9XG5cbiAgY29ubmVjdCgpIHtcbiAgICBpZiAodGhpcy5jb25uZWN0aW9uUHJvbWlzZSkge1xuICAgICAgcmV0dXJuIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gICAgfVxuXG4gICAgLy8gcGFyc2luZyBhbmQgcmUtZm9ybWF0dGluZyBjYXVzZXMgdGhlIGF1dGggdmFsdWUgKGlmIHRoZXJlKSB0byBnZXQgVVJJXG4gICAgLy8gZW5jb2RlZFxuICAgIGNvbnN0IGVuY29kZWRVcmkgPSBmb3JtYXRVcmwocGFyc2VVcmwodGhpcy5fdXJpKSk7XG4gICAgdGhpcy5jb25uZWN0aW9uUHJvbWlzZSA9IE1vbmdvQ2xpZW50LmNvbm5lY3QoZW5jb2RlZFVyaSwgdGhpcy5fbW9uZ29PcHRpb25zKVxuICAgICAgLnRoZW4oY2xpZW50ID0+IHtcbiAgICAgICAgLy8gU3RhcnRpbmcgbW9uZ29EQiAzLjAsIHRoZSBNb25nb0NsaWVudC5jb25uZWN0IGRvbid0IHJldHVybiBhIERCIGFueW1vcmUgYnV0IGEgY2xpZW50XG4gICAgICAgIC8vIEZvcnR1bmF0ZWx5LCB3ZSBjYW4gZ2V0IGJhY2sgdGhlIG9wdGlvbnMgYW5kIHVzZSB0aGVtIHRvIHNlbGVjdCB0aGUgcHJvcGVyIERCLlxuICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vbW9uZ29kYi9ub2RlLW1vbmdvZGItbmF0aXZlL2Jsb2IvMmMzNWQ3NmYwODU3NDIyNWI4ZGIwMmQ3YmVmNjg3MTIzZTZiYjAxOC9saWIvbW9uZ29fY2xpZW50LmpzI0w4ODVcbiAgICAgICAgY29uc3Qgb3B0aW9ucyA9IGNsaWVudC5zLm9wdGlvbnM7XG4gICAgICAgIGNvbnN0IGRhdGFiYXNlID0gY2xpZW50LmRiKG9wdGlvbnMuZGJOYW1lKTtcbiAgICAgICAgaWYgKCFkYXRhYmFzZSkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjbGllbnQub24oJ2Vycm9yJywgKCkgPT4ge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICB9KTtcbiAgICAgICAgY2xpZW50Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuY2xpZW50ID0gY2xpZW50O1xuICAgICAgICB0aGlzLmRhdGFiYXNlID0gZGF0YWJhc2U7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyKTtcbiAgICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gIH1cblxuICBoYW5kbGVFcnJvcjxUPihlcnJvcjogPyhFcnJvciB8IFBhcnNlLkVycm9yKSk6IFByb21pc2U8VD4ge1xuICAgIGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSAxMykge1xuICAgICAgLy8gVW5hdXRob3JpemVkIGVycm9yXG4gICAgICBkZWxldGUgdGhpcy5jbGllbnQ7XG4gICAgICBkZWxldGUgdGhpcy5kYXRhYmFzZTtcbiAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgbG9nZ2VyLmVycm9yKCdSZWNlaXZlZCB1bmF1dGhvcml6ZWQgZXJyb3InLCB7IGVycm9yOiBlcnJvciB9KTtcbiAgICB9XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICBhc3luYyBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBpZiAoIXRoaXMuY2xpZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuY2xpZW50LmNsb3NlKGZhbHNlKTtcbiAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgfVxuXG4gIF9hZGFwdGl2ZUNvbGxlY3Rpb24obmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdCgpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmRhdGFiYXNlLmNvbGxlY3Rpb24odGhpcy5fY29sbGVjdGlvblByZWZpeCArIG5hbWUpKVxuICAgICAgLnRoZW4ocmF3Q29sbGVjdGlvbiA9PiBuZXcgTW9uZ29Db2xsZWN0aW9uKHJhd0NvbGxlY3Rpb24pKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgX3NjaGVtYUNvbGxlY3Rpb24oKTogUHJvbWlzZTxNb25nb1NjaGVtYUNvbGxlY3Rpb24+IHtcbiAgICByZXR1cm4gdGhpcy5jb25uZWN0KClcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lKSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4ge1xuICAgICAgICBpZiAoIXRoaXMuX3N0cmVhbSAmJiB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzKSB7XG4gICAgICAgICAgdGhpcy5fc3RyZWFtID0gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLndhdGNoKCk7XG4gICAgICAgICAgdGhpcy5fc3RyZWFtLm9uKCdjaGFuZ2UnLCAoKSA9PiB0aGlzLl9vbmNoYW5nZSgpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IE1vbmdvU2NoZW1hQ29sbGVjdGlvbihjb2xsZWN0aW9uKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY2xhc3NFeGlzdHMobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdCgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmRhdGFiYXNlLmxpc3RDb2xsZWN0aW9ucyh7IG5hbWU6IHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggKyBuYW1lIH0pLnRvQXJyYXkoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbihjb2xsZWN0aW9ucyA9PiB7XG4gICAgICAgIHJldHVybiBjb2xsZWN0aW9ucy5sZW5ndGggPiAwO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIHNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZywgQ0xQczogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PlxuICAgICAgICBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZVNjaGVtYShjbGFzc05hbWUsIHtcbiAgICAgICAgICAkc2V0OiB7ICdfbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnMnOiBDTFBzIH0sXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRJbmRleGVzOiBhbnksXG4gICAgZXhpc3RpbmdJbmRleGVzOiBhbnkgPSB7fSxcbiAgICBmaWVsZHM6IGFueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoc3VibWl0dGVkSW5kZXhlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhleGlzdGluZ0luZGV4ZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgZXhpc3RpbmdJbmRleGVzID0geyBfaWRfOiB7IF9pZDogMSB9IH07XG4gICAgfVxuICAgIGNvbnN0IGRlbGV0ZVByb21pc2VzID0gW107XG4gICAgY29uc3QgaW5zZXJ0ZWRJbmRleGVzID0gW107XG4gICAgT2JqZWN0LmtleXMoc3VibWl0dGVkSW5kZXhlcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkSW5kZXhlc1tuYW1lXTtcbiAgICAgIGlmIChleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIGBJbmRleCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gKTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbmRleCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICBjb25zdCBwcm9taXNlID0gdGhpcy5kcm9wSW5kZXgoY2xhc3NOYW1lLCBuYW1lKTtcbiAgICAgICAgZGVsZXRlUHJvbWlzZXMucHVzaChwcm9taXNlKTtcbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nSW5kZXhlc1tuYW1lXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIE9iamVjdC5rZXlzKGZpZWxkKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChcbiAgICAgICAgICAgICAgZmllbGRzLFxuICAgICAgICAgICAgICBrZXkuaW5kZXhPZignX3BfJykgPT09IDAgPyBrZXkucmVwbGFjZSgnX3BfJywgJycpIDoga2V5XG4gICAgICAgICAgICApXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICAgIGBGaWVsZCAke2tleX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBhZGQgaW5kZXguYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBleGlzdGluZ0luZGV4ZXNbbmFtZV0gPSBmaWVsZDtcbiAgICAgICAgaW5zZXJ0ZWRJbmRleGVzLnB1c2goe1xuICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgbGV0IGluc2VydFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICBpZiAoaW5zZXJ0ZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGluc2VydFByb21pc2UgPSB0aGlzLmNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lLCBpbnNlcnRlZEluZGV4ZXMpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoZGVsZXRlUHJvbWlzZXMpXG4gICAgICAudGhlbigoKSA9PiBpbnNlcnRQcm9taXNlKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PlxuICAgICAgICBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZVNjaGVtYShjbGFzc05hbWUsIHtcbiAgICAgICAgICAkc2V0OiB7ICdfbWV0YWRhdGEuaW5kZXhlcyc6IGV4aXN0aW5nSW5kZXhlcyB9LFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgc2V0SW5kZXhlc0Zyb21Nb25nbyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmdldEluZGV4ZXMoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oaW5kZXhlcyA9PiB7XG4gICAgICAgIGluZGV4ZXMgPSBpbmRleGVzLnJlZHVjZSgob2JqLCBpbmRleCkgPT4ge1xuICAgICAgICAgIGlmIChpbmRleC5rZXkuX2Z0cykge1xuICAgICAgICAgICAgZGVsZXRlIGluZGV4LmtleS5fZnRzO1xuICAgICAgICAgICAgZGVsZXRlIGluZGV4LmtleS5fZnRzeDtcbiAgICAgICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gaW5kZXgud2VpZ2h0cykge1xuICAgICAgICAgICAgICBpbmRleC5rZXlbZmllbGRdID0gJ3RleHQnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBvYmpbaW5kZXgubmFtZV0gPSBpbmRleC5rZXk7XG4gICAgICAgICAgcmV0dXJuIG9iajtcbiAgICAgICAgfSwge30pO1xuICAgICAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PlxuICAgICAgICAgIHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwge1xuICAgICAgICAgICAgJHNldDogeyAnX21ldGFkYXRhLmluZGV4ZXMnOiBpbmRleGVzIH0sXG4gICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIC8vIElnbm9yZSBpZiBjb2xsZWN0aW9uIG5vdCBmb3VuZFxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNyZWF0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29PYmplY3QgPSBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAoXG4gICAgICBzY2hlbWEuZmllbGRzLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgIHNjaGVtYS5pbmRleGVzXG4gICAgKTtcbiAgICBtb25nb09iamVjdC5faWQgPSBjbGFzc05hbWU7XG4gICAgcmV0dXJuIHRoaXMuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoY2xhc3NOYW1lLCBzY2hlbWEuaW5kZXhlcywge30sIHNjaGVtYS5maWVsZHMpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+IHNjaGVtYUNvbGxlY3Rpb24uaW5zZXJ0U2NoZW1hKG1vbmdvT2JqZWN0KSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIGNvbnN0IHNjaGVtYUNvbGxlY3Rpb24gPSBhd2FpdCB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCk7XG4gICAgYXdhaXQgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpO1xuICB9XG5cbiAgYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi5hZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuY3JlYXRlSW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIERyb3BzIGEgY29sbGVjdGlvbi4gUmVzb2x2ZXMgd2l0aCB0cnVlIGlmIGl0IHdhcyBhIFBhcnNlIFNjaGVtYSAoZWcuIF9Vc2VyLCBDdXN0b20sIGV0Yy4pXG4gIC8vIGFuZCByZXNvbHZlcyB3aXRoIGZhbHNlIGlmIGl0IHdhc24ndCAoZWcuIGEgam9pbiB0YWJsZSkuIFJlamVjdHMgaWYgZGVsZXRpb24gd2FzIGltcG9zc2libGUuXG4gIGRlbGV0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5kcm9wKCkpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgLy8gJ25zIG5vdCBmb3VuZCcgbWVhbnMgY29sbGVjdGlvbiB3YXMgYWxyZWFkeSBnb25lLiBJZ25vcmUgZGVsZXRpb24gYXR0ZW1wdC5cbiAgICAgICAgICBpZiAoZXJyb3IubWVzc2FnZSA9PSAnbnMgbm90IGZvdW5kJykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSlcbiAgICAgICAgLy8gV2UndmUgZHJvcHBlZCB0aGUgY29sbGVjdGlvbiwgbm93IHJlbW92ZSB0aGUgX1NDSEVNQSBkb2N1bWVudFxuICAgICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi5maW5kQW5kRGVsZXRlU2NoZW1hKGNsYXNzTmFtZSkpXG4gICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKVxuICAgICk7XG4gIH1cblxuICBkZWxldGVBbGxDbGFzc2VzKGZhc3Q6IGJvb2xlYW4pIHtcbiAgICByZXR1cm4gc3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyh0aGlzKS50aGVuKGNvbGxlY3Rpb25zID0+XG4gICAgICBQcm9taXNlLmFsbChcbiAgICAgICAgY29sbGVjdGlvbnMubWFwKGNvbGxlY3Rpb24gPT4gKGZhc3QgPyBjb2xsZWN0aW9uLmRlbGV0ZU1hbnkoe30pIDogY29sbGVjdGlvbi5kcm9wKCkpKVxuICAgICAgKVxuICAgICk7XG4gIH1cblxuICAvLyBSZW1vdmUgdGhlIGNvbHVtbiBhbmQgYWxsIHRoZSBkYXRhLiBGb3IgUmVsYXRpb25zLCB0aGUgX0pvaW4gY29sbGVjdGlvbiBpcyBoYW5kbGVkXG4gIC8vIHNwZWNpYWxseSwgdGhpcyBmdW5jdGlvbiBkb2VzIG5vdCBkZWxldGUgX0pvaW4gY29sdW1ucy4gSXQgc2hvdWxkLCBob3dldmVyLCBpbmRpY2F0ZVxuICAvLyB0aGF0IHRoZSByZWxhdGlvbiBmaWVsZHMgZG9lcyBub3QgZXhpc3QgYW55bW9yZS4gSW4gbW9uZ28sIHRoaXMgbWVhbnMgcmVtb3ZpbmcgaXQgZnJvbVxuICAvLyB0aGUgX1NDSEVNQSBjb2xsZWN0aW9uLiAgVGhlcmUgc2hvdWxkIGJlIG5vIGFjdHVhbCBkYXRhIGluIHRoZSBjb2xsZWN0aW9uIHVuZGVyIHRoZSBzYW1lIG5hbWVcbiAgLy8gYXMgdGhlIHJlbGF0aW9uIGNvbHVtbiwgc28gaXQncyBmaW5lIHRvIGF0dGVtcHQgdG8gZGVsZXRlIGl0LiBJZiB0aGUgZmllbGRzIGxpc3RlZCB0byBiZVxuICAvLyBkZWxldGVkIGRvIG5vdCBleGlzdCwgdGhpcyBmdW5jdGlvbiBzaG91bGQgcmV0dXJuIHN1Y2Nlc3NmdWxseSBhbnl3YXlzLiBDaGVja2luZyBmb3JcbiAgLy8gYXR0ZW1wdHMgdG8gZGVsZXRlIG5vbi1leGlzdGVudCBmaWVsZHMgaXMgdGhlIHJlc3BvbnNpYmlsaXR5IG9mIFBhcnNlIFNlcnZlci5cblxuICAvLyBQb2ludGVyIGZpZWxkIG5hbWVzIGFyZSBwYXNzZWQgZm9yIGxlZ2FjeSByZWFzb25zOiB0aGUgb3JpZ2luYWwgbW9uZ29cbiAgLy8gZm9ybWF0IHN0b3JlZCBwb2ludGVyIGZpZWxkIG5hbWVzIGRpZmZlcmVudGx5IGluIHRoZSBkYXRhYmFzZSwgYW5kIHRoZXJlZm9yZVxuICAvLyBuZWVkZWQgdG8ga25vdyB0aGUgdHlwZSBvZiB0aGUgZmllbGQgYmVmb3JlIGl0IGNvdWxkIGRlbGV0ZSBpdC4gRnV0dXJlIGRhdGFiYXNlXG4gIC8vIGFkYXB0ZXJzIHNob3VsZCBpZ25vcmUgdGhlIHBvaW50ZXJGaWVsZE5hbWVzIGFyZ3VtZW50LiBBbGwgdGhlIGZpZWxkIG5hbWVzIGFyZSBpblxuICAvLyBmaWVsZE5hbWVzLCB0aGV5IHNob3cgdXAgYWRkaXRpb25hbGx5IGluIHRoZSBwb2ludGVyRmllbGROYW1lcyBkYXRhYmFzZSBmb3IgdXNlXG4gIC8vIGJ5IHRoZSBtb25nbyBhZGFwdGVyLCB3aGljaCBkZWFscyB3aXRoIHRoZSBsZWdhY3kgbW9uZ28gZm9ybWF0LlxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgbm90IG9ibGlnYXRlZCB0byBkZWxldGUgZmllbGRzIGF0b21pY2FsbHkuIEl0IGlzIGdpdmVuIHRoZSBmaWVsZFxuICAvLyBuYW1lcyBpbiBhIGxpc3Qgc28gdGhhdCBkYXRhYmFzZXMgdGhhdCBhcmUgY2FwYWJsZSBvZiBkZWxldGluZyBmaWVsZHMgYXRvbWljYWxseVxuICAvLyBtYXkgZG8gc28uXG5cbiAgLy8gUmV0dXJucyBhIFByb21pc2UuXG4gIGRlbGV0ZUZpZWxkcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IG1vbmdvRm9ybWF0TmFtZXMgPSBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuIGBfcF8ke2ZpZWxkTmFtZX1gO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZpZWxkTmFtZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25zdCBjb2xsZWN0aW9uVXBkYXRlID0geyAkdW5zZXQ6IHt9IH07XG4gICAgbW9uZ29Gb3JtYXROYW1lcy5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29sbGVjdGlvblVwZGF0ZVsnJHVuc2V0J11bbmFtZV0gPSBudWxsO1xuICAgIH0pO1xuXG4gICAgY29uc3QgY29sbGVjdGlvbkZpbHRlciA9IHsgJG9yOiBbXSB9O1xuICAgIG1vbmdvRm9ybWF0TmFtZXMuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbGxlY3Rpb25GaWx0ZXJbJyRvciddLnB1c2goeyBbbmFtZV06IHsgJGV4aXN0czogdHJ1ZSB9IH0pO1xuICAgIH0pO1xuXG4gICAgY29uc3Qgc2NoZW1hVXBkYXRlID0geyAkdW5zZXQ6IHt9IH07XG4gICAgZmllbGROYW1lcy5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgc2NoZW1hVXBkYXRlWyckdW5zZXQnXVtuYW1lXSA9IG51bGw7XG4gICAgICBzY2hlbWFVcGRhdGVbJyR1bnNldCddW2BfbWV0YWRhdGEuZmllbGRzX29wdGlvbnMuJHtuYW1lfWBdID0gbnVsbDtcbiAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLnVwZGF0ZU1hbnkoY29sbGVjdGlvbkZpbHRlciwgY29sbGVjdGlvblVwZGF0ZSkpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+IHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwgc2NoZW1hVXBkYXRlKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIGFsbCBzY2hlbWFzIGtub3duIHRvIHRoaXMgYWRhcHRlciwgaW4gUGFyc2UgZm9ybWF0LiBJbiBjYXNlIHRoZVxuICAvLyBzY2hlbWFzIGNhbm5vdCBiZSByZXRyaWV2ZWQsIHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVqZWN0cy4gUmVxdWlyZW1lbnRzIGZvciB0aGVcbiAgLy8gcmVqZWN0aW9uIHJlYXNvbiBhcmUgVEJELlxuICBnZXRBbGxDbGFzc2VzKCk6IFByb21pc2U8U3RvcmFnZUNsYXNzW10+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFzQ29sbGVjdGlvbiA9PiBzY2hlbWFzQ29sbGVjdGlvbi5fZmV0Y2hBbGxTY2hlbWFzRnJvbV9TQ0hFTUEoKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIHRoZSBzY2hlbWEgd2l0aCB0aGUgZ2l2ZW4gbmFtZSwgaW4gUGFyc2UgZm9ybWF0LiBJZlxuICAvLyB0aGlzIGFkYXB0ZXIgZG9lc24ndCBrbm93IGFib3V0IHRoZSBzY2hlbWEsIHJldHVybiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpdGhcbiAgLy8gdW5kZWZpbmVkIGFzIHRoZSByZWFzb24uXG4gIGdldENsYXNzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTdG9yYWdlQ2xhc3M+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFzQ29sbGVjdGlvbiA9PiBzY2hlbWFzQ29sbGVjdGlvbi5fZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQShjbGFzc05hbWUpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gVE9ETzogQXMgeWV0IG5vdCBwYXJ0aWN1bGFybHkgd2VsbCBzcGVjaWZpZWQuIENyZWF0ZXMgYW4gb2JqZWN0LiBNYXliZSBzaG91bGRuJ3QgZXZlbiBuZWVkIHRoZSBzY2hlbWEsXG4gIC8vIGFuZCBzaG91bGQgaW5mZXIgZnJvbSB0aGUgdHlwZS4gT3IgbWF5YmUgZG9lcyBuZWVkIHRoZSBzY2hlbWEgZm9yIHZhbGlkYXRpb25zLiBPciBtYXliZSBuZWVkc1xuICAvLyB0aGUgc2NoZW1hIG9ubHkgZm9yIHRoZSBsZWdhY3kgbW9uZ28gZm9ybWF0LiBXZSdsbCBmaWd1cmUgdGhhdCBvdXQgbGF0ZXIuXG4gIGNyZWF0ZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBvYmplY3Q6IGFueSwgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnkpIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29PYmplY3QgPSBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uaW5zZXJ0T25lKG1vbmdvT2JqZWN0LCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikpXG4gICAgICAudGhlbigoKSA9PiAoeyBvcHM6IFttb25nb09iamVjdF0gfSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICAvLyBEdXBsaWNhdGUgdmFsdWVcbiAgICAgICAgICBjb25zdCBlcnIgPSBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICAgIGVyci51bmRlcmx5aW5nRXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICBpZiAoZXJyb3IubWVzc2FnZSkge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IGVycm9yLm1lc3NhZ2UubWF0Y2goL2luZGV4OltcXHNhLXpBLVowLTlfXFwtXFwuXStcXCQ/KFthLXpBLVpfLV0rKV8xLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcyAmJiBBcnJheS5pc0FycmF5KG1hdGNoZXMpKSB7XG4gICAgICAgICAgICAgIGVyci51c2VySW5mbyA9IHsgZHVwbGljYXRlZF9maWVsZDogbWF0Y2hlc1sxXSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gUmVtb3ZlIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICAvLyBJZiBubyBvYmplY3RzIG1hdGNoLCByZWplY3Qgd2l0aCBPQkpFQ1RfTk9UX0ZPVU5ELiBJZiBvYmplY3RzIGFyZSBmb3VuZCBhbmQgZGVsZXRlZCwgcmVzb2x2ZSB3aXRoIHVuZGVmaW5lZC5cbiAgLy8gSWYgdGhlcmUgaXMgc29tZSBvdGhlciBlcnJvciwgcmVqZWN0IHdpdGggSU5URVJOQUxfU0VSVkVSX0VSUk9SLlxuICBkZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IHtcbiAgICAgICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgICAgIHJldHVybiBjb2xsZWN0aW9uLmRlbGV0ZU1hbnkobW9uZ29XaGVyZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKVxuICAgICAgLnRoZW4oXG4gICAgICAgICh7IGRlbGV0ZWRDb3VudCB9KSA9PiB7XG4gICAgICAgICAgaWYgKGRlbGV0ZWRDb3VudCA9PT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH0sXG4gICAgICAgICgpID0+IHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCAnRGF0YWJhc2UgYWRhcHRlciBlcnJvcicpO1xuICAgICAgICB9XG4gICAgICApO1xuICB9XG5cbiAgLy8gQXBwbHkgdGhlIHVwZGF0ZSB0byBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgdXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvVXBkYXRlID0gdHJhbnNmb3JtVXBkYXRlKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLnVwZGF0ZU1hbnkobW9uZ29XaGVyZSwgbW9uZ29VcGRhdGUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIEF0b21pY2FsbHkgZmluZHMgYW5kIHVwZGF0ZXMgYW4gb2JqZWN0IGJhc2VkIG9uIHF1ZXJ5LlxuICAvLyBSZXR1cm4gdmFsdWUgbm90IGN1cnJlbnRseSB3ZWxsIHNwZWNpZmllZC5cbiAgZmluZE9uZUFuZFVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29VcGRhdGUgPSB0cmFuc2Zvcm1VcGRhdGUoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5maW5kT25lQW5kVXBkYXRlKG1vbmdvV2hlcmUsIG1vbmdvVXBkYXRlLCB7XG4gICAgICAgICAgcmV0dXJuRG9jdW1lbnQ6ICdhZnRlcicsXG4gICAgICAgICAgc2Vzc2lvbjogdHJhbnNhY3Rpb25hbFNlc3Npb24gfHwgdW5kZWZpbmVkLFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0ID0+IG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIHJlc3VsdC52YWx1ZSwgc2NoZW1hKSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSAxMTAwMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gSG9wZWZ1bGx5IHdlIGNhbiBnZXQgcmlkIG9mIHRoaXMuIEl0J3Mgb25seSB1c2VkIGZvciBjb25maWcgYW5kIGhvb2tzLlxuICB1cHNlcnRPbmVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvVXBkYXRlID0gdHJhbnNmb3JtVXBkYXRlKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLnVwc2VydE9uZShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBmaW5kLiBBY2NlcHRzOiBjbGFzc05hbWUsIHF1ZXJ5IGluIFBhcnNlIGZvcm1hdCwgYW5kIHsgc2tpcCwgbGltaXQsIHNvcnQgfS5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB7XG4gICAgICBza2lwLFxuICAgICAgbGltaXQsXG4gICAgICBzb3J0LFxuICAgICAga2V5cyxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgIGV4cGxhaW4sXG4gICAgICBjb21tZW50LFxuICAgIH06IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPGFueT4ge1xuICAgIHZhbGlkYXRlRXhwbGFpblZhbHVlKGV4cGxhaW4pO1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1NvcnQgPSBfLm1hcEtleXMoc29ydCwgKHZhbHVlLCBmaWVsZE5hbWUpID0+XG4gICAgICB0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYSlcbiAgICApO1xuICAgIGNvbnN0IG1vbmdvS2V5cyA9IF8ucmVkdWNlKFxuICAgICAga2V5cyxcbiAgICAgIChtZW1vLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgICBtZW1vWydfcnBlcm0nXSA9IDE7XG4gICAgICAgICAgbWVtb1snX3dwZXJtJ10gPSAxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG1lbW9bdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwga2V5LCBzY2hlbWEpXSA9IDE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9LFxuICAgICAge31cbiAgICApO1xuXG4gICAgLy8gSWYgd2UgYXJlbid0IHJlcXVlc3RpbmcgdGhlIGBfaWRgIGZpZWxkLCB3ZSBuZWVkIHRvIGV4cGxpY2l0bHkgb3B0IG91dFxuICAgIC8vIG9mIGl0LiBEb2luZyBzbyBpbiBwYXJzZS1zZXJ2ZXIgaXMgdW51c3VhbCwgYnV0IGl0IGNhbiBhbGxvdyB1cyB0b1xuICAgIC8vIG9wdGltaXplIHNvbWUgcXVlcmllcyB3aXRoIGNvdmVyaW5nIGluZGV4ZXMuXG4gICAgaWYgKGtleXMgJiYgIW1vbmdvS2V5cy5faWQpIHtcbiAgICAgIG1vbmdvS2V5cy5faWQgPSAwO1xuICAgIH1cblxuICAgIHJlYWRQcmVmZXJlbmNlID0gdGhpcy5fcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZSk7XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlVGV4dEluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5maW5kKG1vbmdvV2hlcmUsIHtcbiAgICAgICAgICBza2lwLFxuICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgIHNvcnQ6IG1vbmdvU29ydCxcbiAgICAgICAgICBrZXlzOiBtb25nb0tleXMsXG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgaGludCxcbiAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICBjb21tZW50LFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4ob2JqZWN0cyA9PiB7XG4gICAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG9iamVjdHMubWFwKG9iamVjdCA9PiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGVuc3VyZUluZGV4KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXSxcbiAgICBpbmRleE5hbWU6ID9zdHJpbmcsXG4gICAgY2FzZUluc2Vuc2l0aXZlOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9ucz86IE9iamVjdCA9IHt9XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGluZGV4Q3JlYXRpb25SZXF1ZXN0ID0ge307XG4gICAgY29uc3QgbW9uZ29GaWVsZE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSk7XG4gICAgbW9uZ29GaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGluZGV4Q3JlYXRpb25SZXF1ZXN0W2ZpZWxkTmFtZV0gPSBvcHRpb25zLmluZGV4VHlwZSAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5pbmRleFR5cGUgOiAxO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZGVmYXVsdE9wdGlvbnM6IE9iamVjdCA9IHsgYmFja2dyb3VuZDogdHJ1ZSwgc3BhcnNlOiB0cnVlIH07XG4gICAgY29uc3QgaW5kZXhOYW1lT3B0aW9uczogT2JqZWN0ID0gaW5kZXhOYW1lID8geyBuYW1lOiBpbmRleE5hbWUgfSA6IHt9O1xuICAgIGNvbnN0IHR0bE9wdGlvbnM6IE9iamVjdCA9IG9wdGlvbnMudHRsICE9PSB1bmRlZmluZWQgPyB7IGV4cGlyZUFmdGVyU2Vjb25kczogb3B0aW9ucy50dGwgfSA6IHt9O1xuICAgIGNvbnN0IGNhc2VJbnNlbnNpdGl2ZU9wdGlvbnM6IE9iamVjdCA9IGNhc2VJbnNlbnNpdGl2ZVxuICAgICAgPyB7IGNvbGxhdGlvbjogTW9uZ29Db2xsZWN0aW9uLmNhc2VJbnNlbnNpdGl2ZUNvbGxhdGlvbigpIH1cbiAgICAgIDoge307XG4gICAgY29uc3QgaW5kZXhPcHRpb25zOiBPYmplY3QgPSB7XG4gICAgICAuLi5kZWZhdWx0T3B0aW9ucyxcbiAgICAgIC4uLmNhc2VJbnNlbnNpdGl2ZU9wdGlvbnMsXG4gICAgICAuLi5pbmRleE5hbWVPcHRpb25zLFxuICAgICAgLi4udHRsT3B0aW9ucyxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5jcmVhdGVJbmRleChpbmRleENyZWF0aW9uUmVxdWVzdCwgaW5kZXhPcHRpb25zKVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgdW5pcXVlIGluZGV4LiBVbmlxdWUgaW5kZXhlcyBvbiBudWxsYWJsZSBmaWVsZHMgYXJlIG5vdCBhbGxvd2VkLiBTaW5jZSB3ZSBkb24ndFxuICAvLyBjdXJyZW50bHkga25vdyB3aGljaCBmaWVsZHMgYXJlIG51bGxhYmxlIGFuZCB3aGljaCBhcmVuJ3QsIHdlIGlnbm9yZSB0aGF0IGNyaXRlcmlhLlxuICAvLyBBcyBzdWNoLCB3ZSBzaG91bGRuJ3QgZXhwb3NlIHRoaXMgZnVuY3Rpb24gdG8gdXNlcnMgb2YgcGFyc2UgdW50aWwgd2UgaGF2ZSBhbiBvdXQtb2YtYmFuZFxuICAvLyBXYXkgb2YgZGV0ZXJtaW5pbmcgaWYgYSBmaWVsZCBpcyBudWxsYWJsZS4gVW5kZWZpbmVkIGRvZXNuJ3QgY291bnQgYWdhaW5zdCB1bmlxdWVuZXNzLFxuICAvLyB3aGljaCBpcyB3aHkgd2UgdXNlIHNwYXJzZSBpbmRleGVzLlxuICBlbnN1cmVVbmlxdWVuZXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGluZGV4Q3JlYXRpb25SZXF1ZXN0ID0ge307XG4gICAgY29uc3QgbW9uZ29GaWVsZE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSk7XG4gICAgbW9uZ29GaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGluZGV4Q3JlYXRpb25SZXF1ZXN0W2ZpZWxkTmFtZV0gPSAxO1xuICAgIH0pO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9lbnN1cmVTcGFyc2VVbmlxdWVJbmRleEluQmFja2dyb3VuZChpbmRleENyZWF0aW9uUmVxdWVzdCkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnVHJpZWQgdG8gZW5zdXJlIGZpZWxkIHVuaXF1ZW5lc3MgZm9yIGEgY2xhc3MgdGhhdCBhbHJlYWR5IGhhcyBkdXBsaWNhdGVzLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFVzZWQgaW4gdGVzdHNcbiAgX3Jhd0ZpbmQoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBRdWVyeVR5cGUpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5maW5kKHF1ZXJ5LCB7XG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGNvdW50LlxuICBjb3VudChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICByZWFkUHJlZmVyZW5jZTogP3N0cmluZyxcbiAgICBfZXN0aW1hdGU6ID9ib29sZWFuLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBjb21tZW50OiA/c3RyaW5nXG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICByZWFkUHJlZmVyZW5jZSA9IHRoaXMuX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2UpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmNvdW50KHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSwgdHJ1ZSksIHtcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICBoaW50LFxuICAgICAgICAgIGNvbW1lbnQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBkaXN0aW5jdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBxdWVyeTogUXVlcnlUeXBlLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuICAgIGNvbnN0IHRyYW5zZm9ybUZpZWxkID0gdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpO1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uZGlzdGluY3QodHJhbnNmb3JtRmllbGQsIHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSkpXG4gICAgICApXG4gICAgICAudGhlbihvYmplY3RzID0+IHtcbiAgICAgICAgb2JqZWN0cyA9IG9iamVjdHMuZmlsdGVyKG9iaiA9PiBvYmogIT0gbnVsbCk7XG4gICAgICAgIHJldHVybiBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIGlmIChpc1BvaW50ZXJGaWVsZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcoc2NoZW1hLCBmaWVsZE5hbWUsIG9iamVjdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGFnZ3JlZ2F0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IGFueSxcbiAgICBwaXBlbGluZTogYW55LFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBleHBsYWluPzogYm9vbGVhbixcbiAgICBjb21tZW50OiA/c3RyaW5nXG4gICkge1xuICAgIHZhbGlkYXRlRXhwbGFpblZhbHVlKGV4cGxhaW4pO1xuICAgIGxldCBpc1BvaW50ZXJGaWVsZCA9IGZhbHNlO1xuICAgIHBpcGVsaW5lID0gcGlwZWxpbmUubWFwKHN0YWdlID0+IHtcbiAgICAgIGlmIChzdGFnZS4kZ3JvdXApIHtcbiAgICAgICAgc3RhZ2UuJGdyb3VwID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hLCBzdGFnZS4kZ3JvdXApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgc3RhZ2UuJGdyb3VwLl9pZCAmJlxuICAgICAgICAgIHR5cGVvZiBzdGFnZS4kZ3JvdXAuX2lkID09PSAnc3RyaW5nJyAmJlxuICAgICAgICAgIHN0YWdlLiRncm91cC5faWQuaW5kZXhPZignJF9wXycpID49IDBcbiAgICAgICAgKSB7XG4gICAgICAgICAgaXNQb2ludGVyRmllbGQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgIHN0YWdlLiRtYXRjaCA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHN0YWdlLiRtYXRjaCk7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHByb2plY3QpIHtcbiAgICAgICAgc3RhZ2UuJHByb2plY3QgPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZVByb2plY3RBcmdzKHNjaGVtYSwgc3RhZ2UuJHByb2plY3QpO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRnZW9OZWFyICYmIHN0YWdlLiRnZW9OZWFyLnF1ZXJ5KSB7XG4gICAgICAgIHN0YWdlLiRnZW9OZWFyLnF1ZXJ5ID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgc3RhZ2UuJGdlb05lYXIucXVlcnkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0YWdlO1xuICAgIH0pO1xuICAgIHJlYWRQcmVmZXJlbmNlID0gdGhpcy5fcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uYWdncmVnYXRlKHBpcGVsaW5lLCB7XG4gICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgICAgaGludCxcbiAgICAgICAgICBleHBsYWluLFxuICAgICAgICAgIGNvbW1lbnQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN1bHQsICdfaWQnKSkge1xuICAgICAgICAgICAgaWYgKGlzUG9pbnRlckZpZWxkICYmIHJlc3VsdC5faWQpIHtcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9IHJlc3VsdC5faWQuc3BsaXQoJyQnKVsxXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9PSBudWxsIHx8XG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgICAgIChbJ29iamVjdCcsICdzdHJpbmcnXS5pbmNsdWRlcyh0eXBlb2YgcmVzdWx0Ll9pZCkgJiYgXy5pc0VtcHR5KHJlc3VsdC5faWQpKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0gcmVzdWx0Ll9pZDtcbiAgICAgICAgICAgIGRlbGV0ZSByZXN1bHQuX2lkO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgfSlcbiAgICAgIC50aGVuKG9iamVjdHMgPT4gb2JqZWN0cy5tYXAob2JqZWN0ID0+IG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIHdpbGwgcmVjdXJzaXZlbHkgdHJhdmVyc2UgdGhlIHBpcGVsaW5lIGFuZCBjb252ZXJ0IGFueSBQb2ludGVyIG9yIERhdGUgY29sdW1ucy5cbiAgLy8gSWYgd2UgZGV0ZWN0IGEgcG9pbnRlciBjb2x1bW4gd2Ugd2lsbCByZW5hbWUgdGhlIGNvbHVtbiBiZWluZyBxdWVyaWVkIGZvciB0byBtYXRjaCB0aGUgY29sdW1uXG4gIC8vIGluIHRoZSBkYXRhYmFzZS4gV2UgYWxzbyBtb2RpZnkgdGhlIHZhbHVlIHRvIHdoYXQgd2UgZXhwZWN0IHRoZSB2YWx1ZSB0byBiZSBpbiB0aGUgZGF0YWJhc2VcbiAgLy8gYXMgd2VsbC5cbiAgLy8gRm9yIGRhdGVzLCB0aGUgZHJpdmVyIGV4cGVjdHMgYSBEYXRlIG9iamVjdCwgYnV0IHdlIGhhdmUgYSBzdHJpbmcgY29taW5nIGluLiBTbyB3ZSdsbCBjb252ZXJ0XG4gIC8vIHRoZSBzdHJpbmcgdG8gYSBEYXRlIHNvIHRoZSBkcml2ZXIgY2FuIHBlcmZvcm0gdGhlIG5lY2Vzc2FyeSBjb21wYXJpc29uLlxuICAvL1xuICAvLyBUaGUgZ29hbCBvZiB0aGlzIG1ldGhvZCBpcyB0byBsb29rIGZvciB0aGUgXCJsZWF2ZXNcIiBvZiB0aGUgcGlwZWxpbmUgYW5kIGRldGVybWluZSBpZiBpdCBuZWVkc1xuICAvLyB0byBiZSBjb252ZXJ0ZWQuIFRoZSBwaXBlbGluZSBjYW4gaGF2ZSBhIGZldyBkaWZmZXJlbnQgZm9ybXMuIEZvciBtb3JlIGRldGFpbHMsIHNlZTpcbiAgLy8gICAgIGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvcmVmZXJlbmNlL29wZXJhdG9yL2FnZ3JlZ2F0aW9uL1xuICAvL1xuICAvLyBJZiB0aGUgcGlwZWxpbmUgaXMgYW4gYXJyYXksIGl0IG1lYW5zIHdlIGFyZSBwcm9iYWJseSBwYXJzaW5nIGFuICckYW5kJyBvciAnJG9yJyBvcGVyYXRvci4gSW5cbiAgLy8gdGhhdCBjYXNlIHdlIG5lZWQgdG8gbG9vcCB0aHJvdWdoIGFsbCBvZiBpdCdzIGNoaWxkcmVuIHRvIGZpbmQgdGhlIGNvbHVtbnMgYmVpbmcgb3BlcmF0ZWQgb24uXG4gIC8vIElmIHRoZSBwaXBlbGluZSBpcyBhbiBvYmplY3QsIHRoZW4gd2UnbGwgbG9vcCB0aHJvdWdoIHRoZSBrZXlzIGNoZWNraW5nIHRvIHNlZSBpZiB0aGUga2V5IG5hbWVcbiAgLy8gbWF0Y2hlcyBvbmUgb2YgdGhlIHNjaGVtYSBjb2x1bW5zLiBJZiBpdCBkb2VzIG1hdGNoIGEgY29sdW1uIGFuZCB0aGUgY29sdW1uIGlzIGEgUG9pbnRlciBvclxuICAvLyBhIERhdGUsIHRoZW4gd2UnbGwgY29udmVydCB0aGUgdmFsdWUgYXMgZGVzY3JpYmVkIGFib3ZlLlxuICAvL1xuICAvLyBBcyBtdWNoIGFzIEkgaGF0ZSByZWN1cnNpb24uLi50aGlzIHNlZW1lZCBsaWtlIGEgZ29vZCBmaXQgZm9yIGl0LiBXZSdyZSBlc3NlbnRpYWxseSB0cmF2ZXJzaW5nXG4gIC8vIGRvd24gYSB0cmVlIHRvIGZpbmQgYSBcImxlYWYgbm9kZVwiIGFuZCBjaGVja2luZyB0byBzZWUgaWYgaXQgbmVlZHMgdG8gYmUgY29udmVydGVkLlxuICBfcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYTogYW55LCBwaXBlbGluZTogYW55KTogYW55IHtcbiAgICBpZiAocGlwZWxpbmUgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShwaXBlbGluZSkpIHtcbiAgICAgIHJldHVybiBwaXBlbGluZS5tYXAodmFsdWUgPT4gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgdmFsdWUpKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwaXBlbGluZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHBpcGVsaW5lKSB7XG4gICAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHBpcGVsaW5lW2ZpZWxkXSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIC8vIFBhc3Mgb2JqZWN0cyBkb3duIHRvIE1vbmdvREIuLi50aGlzIGlzIG1vcmUgdGhhbiBsaWtlbHkgYW4gJGV4aXN0cyBvcGVyYXRvci5cbiAgICAgICAgICAgIHJldHVyblZhbHVlW2BfcF8ke2ZpZWxkfWBdID0gcGlwZWxpbmVbZmllbGRdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm5WYWx1ZVtgX3BfJHtmaWVsZH1gXSA9IGAke3NjaGVtYS5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzfSQke3BpcGVsaW5lW2ZpZWxkXX1gO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnRGF0ZScpIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9jb252ZXJ0VG9EYXRlKHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgcGlwZWxpbmVbZmllbGRdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmaWVsZCA9PT0gJ29iamVjdElkJykge1xuICAgICAgICAgIHJldHVyblZhbHVlWydfaWQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkID09PSAnY3JlYXRlZEF0Jykge1xuICAgICAgICAgIHJldHVyblZhbHVlWydfY3JlYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ191cGRhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICAgIH1cbiAgICByZXR1cm4gcGlwZWxpbmU7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIHNsaWdodGx5IGRpZmZlcmVudCB0aGFuIHRoZSBvbmUgYWJvdmUuIFJhdGhlciB0aGFuIHRyeWluZyB0byBjb21iaW5lIHRoZXNlXG4gIC8vIHR3byBmdW5jdGlvbnMgYW5kIG1ha2luZyB0aGUgY29kZSBldmVuIGhhcmRlciB0byB1bmRlcnN0YW5kLCBJIGRlY2lkZWQgdG8gc3BsaXQgaXQgdXAuIFRoZVxuICAvLyBkaWZmZXJlbmNlIHdpdGggdGhpcyBmdW5jdGlvbiBpcyB3ZSBhcmUgbm90IHRyYW5zZm9ybWluZyB0aGUgdmFsdWVzLCBvbmx5IHRoZSBrZXlzIG9mIHRoZVxuICAvLyBwaXBlbGluZS5cbiAgX3BhcnNlQWdncmVnYXRlUHJvamVjdEFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgZm9yIChjb25zdCBmaWVsZCBpbiBwaXBlbGluZSkge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm5WYWx1ZVtgX3BfJHtmaWVsZH1gXSA9IHBpcGVsaW5lW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChmaWVsZCA9PT0gJ29iamVjdElkJykge1xuICAgICAgICByZXR1cm5WYWx1ZVsnX2lkJ10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09PSAnY3JlYXRlZEF0Jykge1xuICAgICAgICByZXR1cm5WYWx1ZVsnX2NyZWF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfdXBkYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIHNsaWdodGx5IGRpZmZlcmVudCB0aGFuIHRoZSB0d28gYWJvdmUuIE1vbmdvREIgJGdyb3VwIGFnZ3JlZ2F0ZSBsb29rcyBsaWtlOlxuICAvLyAgICAgeyAkZ3JvdXA6IHsgX2lkOiA8ZXhwcmVzc2lvbj4sIDxmaWVsZDE+OiB7IDxhY2N1bXVsYXRvcjE+IDogPGV4cHJlc3Npb24xPiB9LCAuLi4gfSB9XG4gIC8vIFRoZSA8ZXhwcmVzc2lvbj4gY291bGQgYmUgYSBjb2x1bW4gbmFtZSwgcHJlZml4ZWQgd2l0aCB0aGUgJyQnIGNoYXJhY3Rlci4gV2UnbGwgbG9vayBmb3JcbiAgLy8gdGhlc2UgPGV4cHJlc3Npb24+IGFuZCBjaGVjayB0byBzZWUgaWYgaXQgaXMgYSAnUG9pbnRlcicgb3IgaWYgaXQncyBvbmUgb2YgY3JlYXRlZEF0LFxuICAvLyB1cGRhdGVkQXQgb3Igb2JqZWN0SWQgYW5kIGNoYW5nZSBpdCBhY2NvcmRpbmdseS5cbiAgX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYTogYW55LCBwaXBlbGluZTogYW55KTogYW55IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShwaXBlbGluZSkpIHtcbiAgICAgIHJldHVybiBwaXBlbGluZS5tYXAodmFsdWUgPT4gdGhpcy5fcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hLCB2YWx1ZSkpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHBpcGVsaW5lID09PSAnb2JqZWN0Jykge1xuICAgICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gcGlwZWxpbmUpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hLCBwaXBlbGluZVtmaWVsZF0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHBpcGVsaW5lID09PSAnc3RyaW5nJykge1xuICAgICAgY29uc3QgZmllbGQgPSBwaXBlbGluZS5zdWJzdHJpbmcoMSk7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgJF9wXyR7ZmllbGR9YDtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT0gJ2NyZWF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuICckX2NyZWF0ZWRfYXQnO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PSAndXBkYXRlZEF0Jykge1xuICAgICAgICByZXR1cm4gJyRfdXBkYXRlZF9hdCc7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBwaXBlbGluZTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gd2lsbCBhdHRlbXB0IHRvIGNvbnZlcnQgdGhlIHByb3ZpZGVkIHZhbHVlIHRvIGEgRGF0ZSBvYmplY3QuIFNpbmNlIHRoaXMgaXMgcGFydFxuICAvLyBvZiBhbiBhZ2dyZWdhdGlvbiBwaXBlbGluZSwgdGhlIHZhbHVlIGNhbiBlaXRoZXIgYmUgYSBzdHJpbmcgb3IgaXQgY2FuIGJlIGFub3RoZXIgb2JqZWN0IHdpdGhcbiAgLy8gYW4gb3BlcmF0b3IgaW4gaXQgKGxpa2UgJGd0LCAkbHQsIGV0YykuIEJlY2F1c2Ugb2YgdGhpcyBJIGZlbHQgaXQgd2FzIGVhc2llciB0byBtYWtlIHRoaXMgYVxuICAvLyByZWN1cnNpdmUgbWV0aG9kIHRvIHRyYXZlcnNlIGRvd24gdG8gdGhlIFwibGVhZiBub2RlXCIgd2hpY2ggaXMgZ29pbmcgdG8gYmUgdGhlIHN0cmluZy5cbiAgX2NvbnZlcnRUb0RhdGUodmFsdWU6IGFueSk6IGFueSB7XG4gICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIG5ldyBEYXRlKHZhbHVlKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgIGZvciAoY29uc3QgZmllbGQgaW4gdmFsdWUpIHtcbiAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX2NvbnZlcnRUb0RhdGUodmFsdWVbZmllbGRdKTtcbiAgICB9XG4gICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICB9XG5cbiAgX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2U6ID9zdHJpbmcpOiA/c3RyaW5nIHtcbiAgICBpZiAocmVhZFByZWZlcmVuY2UpIHtcbiAgICAgIHJlYWRQcmVmZXJlbmNlID0gcmVhZFByZWZlcmVuY2UudG9VcHBlckNhc2UoKTtcbiAgICB9XG4gICAgc3dpdGNoIChyZWFkUHJlZmVyZW5jZSkge1xuICAgICAgY2FzZSAnUFJJTUFSWSc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuUFJJTUFSWTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdQUklNQVJZX1BSRUZFUlJFRCc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuUFJJTUFSWV9QUkVGRVJSRUQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VDT05EQVJZJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5TRUNPTkRBUlk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VDT05EQVJZX1BSRUZFUlJFRCc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuU0VDT05EQVJZX1BSRUZFUlJFRDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdORUFSRVNUJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5ORUFSRVNUO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgdW5kZWZpbmVkOlxuICAgICAgY2FzZSBudWxsOlxuICAgICAgY2FzZSAnJzpcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ05vdCBzdXBwb3J0ZWQgcmVhZCBwcmVmZXJlbmNlLicpO1xuICAgIH1cbiAgICByZXR1cm4gcmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBwZXJmb3JtSW5pdGlhbGl6YXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXgoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4OiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmNyZWF0ZUluZGV4KGluZGV4KSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhlcyhpbmRleGVzKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGNyZWF0ZUluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIGlmICh0eXBlICYmIHR5cGUudHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICBjb25zdCBpbmRleCA9IHtcbiAgICAgICAgW2ZpZWxkTmFtZV06ICcyZHNwaGVyZScsXG4gICAgICB9O1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlSW5kZXgoY2xhc3NOYW1lLCBpbmRleCk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNyZWF0ZVRleHRJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBRdWVyeVR5cGUsIHNjaGVtYTogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gcXVlcnkpIHtcbiAgICAgIGlmICghcXVlcnlbZmllbGROYW1lXSB8fCAhcXVlcnlbZmllbGROYW1lXS4kdGV4dCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgZm9yIChjb25zdCBrZXkgaW4gZXhpc3RpbmdJbmRleGVzKSB7XG4gICAgICAgIGNvbnN0IGluZGV4ID0gZXhpc3RpbmdJbmRleGVzW2tleV07XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoaW5kZXgsIGZpZWxkTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnN0IGluZGV4TmFtZSA9IGAke2ZpZWxkTmFtZX1fdGV4dGA7XG4gICAgICBjb25zdCB0ZXh0SW5kZXggPSB7XG4gICAgICAgIFtpbmRleE5hbWVdOiB7IFtmaWVsZE5hbWVdOiAndGV4dCcgfSxcbiAgICAgIH07XG4gICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICB0ZXh0SW5kZXgsXG4gICAgICAgIGV4aXN0aW5nSW5kZXhlcyxcbiAgICAgICAgc2NoZW1hLmZpZWxkc1xuICAgICAgKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSA4NSkge1xuICAgICAgICAgIC8vIEluZGV4IGV4aXN0IHdpdGggZGlmZmVyZW50IG9wdGlvbnNcbiAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzRnJvbU1vbmdvKGNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgZ2V0SW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uaW5kZXhlcygpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZHJvcEluZGV4KGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleDogYW55KSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5kcm9wSW5kZXgoaW5kZXgpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZHJvcEFsbEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmRyb3BJbmRleGVzKCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICB1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiB0aGlzLmdldEFsbENsYXNzZXMoKVxuICAgICAgLnRoZW4oY2xhc3NlcyA9PiB7XG4gICAgICAgIGNvbnN0IHByb21pc2VzID0gY2xhc3Nlcy5tYXAoc2NoZW1hID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzRnJvbU1vbmdvKHNjaGVtYS5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxTZWN0aW9uID0gdGhpcy5jbGllbnQuc3RhcnRTZXNzaW9uKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uc3RhcnRUcmFuc2FjdGlvbigpO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJhbnNhY3Rpb25hbFNlY3Rpb24pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlY3Rpb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNvbW1pdCA9IHJldHJpZXMgPT4ge1xuICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZWN0aW9uXG4gICAgICAgIC5jb21taXRUcmFuc2FjdGlvbigpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmhhc0Vycm9yTGFiZWwoJ1RyYW5zaWVudFRyYW5zYWN0aW9uRXJyb3InKSAmJiByZXRyaWVzID4gMCkge1xuICAgICAgICAgICAgcmV0dXJuIGNvbW1pdChyZXRyaWVzIC0gMSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uZW5kU2Vzc2lvbigpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIHJldHVybiBjb21taXQoNSk7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZWN0aW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlY3Rpb24uYWJvcnRUcmFuc2FjdGlvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uZW5kU2Vzc2lvbigpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IE1vbmdvU3RvcmFnZUFkYXB0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUNBLElBQUFBLGdCQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxzQkFBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUUsZUFBQSxHQUFBRixPQUFBO0FBRUEsSUFBQUcsV0FBQSxHQUFBSCxPQUFBO0FBQ0EsSUFBQUksZUFBQSxHQUFBSixPQUFBO0FBU0EsSUFBQUssS0FBQSxHQUFBTixzQkFBQSxDQUFBQyxPQUFBO0FBRUEsSUFBQU0sT0FBQSxHQUFBUCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQU8sU0FBQSxHQUFBUixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVEsT0FBQSxHQUFBVCxzQkFBQSxDQUFBQyxPQUFBO0FBQXFDLFNBQUFELHVCQUFBVSxHQUFBLFdBQUFBLEdBQUEsSUFBQUEsR0FBQSxDQUFBQyxVQUFBLEdBQUFELEdBQUEsS0FBQUUsT0FBQSxFQUFBRixHQUFBO0FBQUEsU0FBQUcsUUFBQUMsQ0FBQSxFQUFBQyxDQUFBLFFBQUFDLENBQUEsR0FBQUMsTUFBQSxDQUFBQyxJQUFBLENBQUFKLENBQUEsT0FBQUcsTUFBQSxDQUFBRSxxQkFBQSxRQUFBQyxDQUFBLEdBQUFILE1BQUEsQ0FBQUUscUJBQUEsQ0FBQUwsQ0FBQSxHQUFBQyxDQUFBLEtBQUFLLENBQUEsR0FBQUEsQ0FBQSxDQUFBQyxNQUFBLFdBQUFOLENBQUEsV0FBQUUsTUFBQSxDQUFBSyx3QkFBQSxDQUFBUixDQUFBLEVBQUFDLENBQUEsRUFBQVEsVUFBQSxPQUFBUCxDQUFBLENBQUFR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