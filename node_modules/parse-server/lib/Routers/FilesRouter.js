"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FilesRouter = void 0;
var _express = _interopRequireDefault(require("express"));
var _bodyParser = _interopRequireDefault(require("body-parser"));
var Middlewares = _interopRequireWildcard(require("../middlewares"));
var _node = _interopRequireDefault(require("parse/node"));
var _Config = _interopRequireDefault(require("../Config"));
var _mime = _interopRequireDefault(require("mime"));
var _logger = _interopRequireDefault(require("../logger"));
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && Object.prototype.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const triggers = require('../triggers');
const http = require('http');
const Utils = require('../Utils');
const downloadFileFromURI = uri => {
  return new Promise((res, rej) => {
    http.get(uri, response => {
      response.setDefaultEncoding('base64');
      let body = `data:${response.headers['content-type']};base64,`;
      response.on('data', data => body += data);
      response.on('end', () => res(body));
    }).on('error', e => {
      rej(`Error downloading file from ${uri}: ${e.message}`);
    });
  });
};
const addFileDataIfNeeded = async file => {
  if (file._source.format === 'uri') {
    const base64 = await downloadFileFromURI(file._source.uri);
    file._previousSave = file;
    file._data = base64;
    file._requestTask = null;
  }
  return file;
};
class FilesRouter {
  expressRouter({
    maxUploadSize = '20Mb'
  } = {}) {
    var router = _express.default.Router();
    router.get('/files/:appId/:filename', this.getHandler);
    router.get('/files/:appId/metadata/:filename', this.metadataHandler);
    router.post('/files', function (req, res, next) {
      next(new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename not provided.'));
    });
    router.post('/files/:filename', _bodyParser.default.raw({
      type: () => {
        return true;
      },
      limit: maxUploadSize
    }),
    // Allow uploads without Content-Type, or with any Content-Type.
    Middlewares.handleParseHeaders, Middlewares.handleParseSession, this.createHandler);
    router.delete('/files/:filename', Middlewares.handleParseHeaders, Middlewares.handleParseSession, Middlewares.enforceMasterKeyAccess, this.deleteHandler);
    return router;
  }
  getHandler(req, res) {
    const config = _Config.default.get(req.params.appId);
    if (!config) {
      res.status(403);
      const err = new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, 'Invalid application ID.');
      res.json({
        code: err.code,
        error: err.message
      });
      return;
    }
    const filesController = config.filesController;
    const filename = req.params.filename;
    const contentType = _mime.default.getType(filename);
    if (isFileStreamable(req, filesController)) {
      filesController.handleFileStream(config, filename, req, res, contentType).catch(() => {
        res.status(404);
        res.set('Content-Type', 'text/plain');
        res.end('File not found.');
      });
    } else {
      filesController.getFileData(config, filename).then(data => {
        res.status(200);
        res.set('Content-Type', contentType);
        res.set('Content-Length', data.length);
        res.end(data);
      }).catch(() => {
        res.status(404);
        res.set('Content-Type', 'text/plain');
        res.end('File not found.');
      });
    }
  }
  async createHandler(req, res, next) {
    var _config$fileUpload;
    const config = req.config;
    const user = req.auth.user;
    const isMaster = req.auth.isMaster;
    const isLinked = user && _node.default.AnonymousUtils.isLinked(user);
    if (!isMaster && !config.fileUpload.enableForAnonymousUser && isLinked) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'File upload by anonymous user is disabled.'));
      return;
    }
    if (!isMaster && !config.fileUpload.enableForAuthenticatedUser && !isLinked && user) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'File upload by authenticated user is disabled.'));
      return;
    }
    if (!isMaster && !config.fileUpload.enableForPublic && !user) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'File upload by public is disabled.'));
      return;
    }
    const filesController = config.filesController;
    const {
      filename
    } = req.params;
    const contentType = req.get('Content-type');
    if (!req.body || !req.body.length) {
      next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'Invalid file upload.'));
      return;
    }
    const error = filesController.validateFilename(filename);
    if (error) {
      next(error);
      return;
    }
    const fileExtensions = (_config$fileUpload = config.fileUpload) === null || _config$fileUpload === void 0 ? void 0 : _config$fileUpload.fileExtensions;
    if (!isMaster && fileExtensions) {
      var _extension;
      const isValidExtension = extension => {
        return fileExtensions.some(ext => {
          if (ext === '*') {
            return true;
          }
          const regex = new RegExp(ext);
          if (regex.test(extension)) {
            return true;
          }
        });
      };
      let extension = contentType;
      if (filename && filename.includes('.')) {
        extension = filename.substring(filename.lastIndexOf('.') + 1);
      } else if (contentType && contentType.includes('/')) {
        extension = contentType.split('/')[1];
      }
      extension = (_extension = extension) === null || _extension === void 0 || (_extension = _extension.split(' ')) === null || _extension === void 0 ? void 0 : _extension.join('');
      if (extension && !isValidExtension(extension)) {
        next(new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, `File upload of extension ${extension} is disabled.`));
        return;
      }
    }
    const base64 = req.body.toString('base64');
    const file = new _node.default.File(filename, {
      base64
    }, contentType);
    const {
      metadata = {},
      tags = {}
    } = req.fileData || {};
    try {
      // Scan request data for denied keywords
      Utils.checkProhibitedKeywords(config, metadata);
      Utils.checkProhibitedKeywords(config, tags);
    } catch (error) {
      next(new _node.default.Error(_node.default.Error.INVALID_KEY_NAME, error));
      return;
    }
    file.setTags(tags);
    file.setMetadata(metadata);
    const fileSize = Buffer.byteLength(req.body);
    const fileObject = {
      file,
      fileSize
    };
    try {
      // run beforeSaveFile trigger
      const triggerResult = await triggers.maybeRunFileTrigger(triggers.Types.beforeSave, fileObject, config, req.auth);
      let saveResult;
      // if a new ParseFile is returned check if it's an already saved file
      if (triggerResult instanceof _node.default.File) {
        fileObject.file = triggerResult;
        if (triggerResult.url()) {
          // set fileSize to null because we wont know how big it is here
          fileObject.fileSize = null;
          saveResult = {
            url: triggerResult.url(),
            name: triggerResult._name
          };
        }
      }
      // if the file returned by the trigger has already been saved skip saving anything
      if (!saveResult) {
        // if the ParseFile returned is type uri, download the file before saving it
        await addFileDataIfNeeded(fileObject.file);
        // update fileSize
        const bufferData = Buffer.from(fileObject.file._data, 'base64');
        fileObject.fileSize = Buffer.byteLength(bufferData);
        // prepare file options
        const fileOptions = {
          metadata: fileObject.file._metadata
        };
        // some s3-compatible providers (DigitalOcean, Linode) do not accept tags
        // so we do not include the tags option if it is empty.
        const fileTags = Object.keys(fileObject.file._tags).length > 0 ? {
          tags: fileObject.file._tags
        } : {};
        Object.assign(fileOptions, fileTags);
        // save file
        const createFileResult = await filesController.createFile(config, fileObject.file._name, bufferData, fileObject.file._source.type, fileOptions);
        // update file with new data
        fileObject.file._name = createFileResult.name;
        fileObject.file._url = createFileResult.url;
        fileObject.file._requestTask = null;
        fileObject.file._previousSave = Promise.resolve(fileObject.file);
        saveResult = {
          url: createFileResult.url,
          name: createFileResult.name
        };
      }
      // run afterSaveFile trigger
      await triggers.maybeRunFileTrigger(triggers.Types.afterSave, fileObject, config, req.auth);
      res.status(201);
      res.set('Location', saveResult.url);
      res.json(saveResult);
    } catch (e) {
      _logger.default.error('Error creating a file: ', e);
      const error = triggers.resolveError(e, {
        code: _node.default.Error.FILE_SAVE_ERROR,
        message: `Could not store file: ${fileObject.file._name}.`
      });
      next(error);
    }
  }
  async deleteHandler(req, res, next) {
    try {
      const {
        filesController
      } = req.config;
      const {
        filename
      } = req.params;
      // run beforeDeleteFile trigger
      const file = new _node.default.File(filename);
      file._url = filesController.adapter.getFileLocation(req.config, filename);
      const fileObject = {
        file,
        fileSize: null
      };
      await triggers.maybeRunFileTrigger(triggers.Types.beforeDelete, fileObject, req.config, req.auth);
      // delete file
      await filesController.deleteFile(req.config, filename);
      // run afterDeleteFile trigger
      await triggers.maybeRunFileTrigger(triggers.Types.afterDelete, fileObject, req.config, req.auth);
      res.status(200);
      // TODO: return useful JSON here?
      res.end();
    } catch (e) {
      _logger.default.error('Error deleting a file: ', e);
      const error = triggers.resolveError(e, {
        code: _node.default.Error.FILE_DELETE_ERROR,
        message: 'Could not delete file.'
      });
      next(error);
    }
  }
  async metadataHandler(req, res) {
    try {
      const config = _Config.default.get(req.params.appId);
      const {
        filesController
      } = config;
      const {
        filename
      } = req.params;
      const data = await filesController.getMetadata(filename);
      res.status(200);
      res.json(data);
    } catch (e) {
      res.status(200);
      res.json({});
    }
  }
}
exports.FilesRouter = FilesRouter;
function isFileStreamable(req, filesController) {
  const range = (req.get('Range') || '/-/').split('-');
  const start = Number(range[0]);
  const end = Number(range[1]);
  return (!isNaN(start) || !isNaN(end)) && typeof filesController.adapter.handleFileStream === 'function';
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZXhwcmVzcyIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2JvZHlQYXJzZXIiLCJNaWRkbGV3YXJlcyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX25vZGUiLCJfQ29uZmlnIiwiX21pbWUiLCJfbG9nZ2VyIiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwiZSIsIldlYWtNYXAiLCJyIiwidCIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiaGFzIiwiZ2V0IiwibiIsIl9fcHJvdG9fXyIsImEiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsInUiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJpIiwic2V0Iiwib2JqIiwidHJpZ2dlcnMiLCJodHRwIiwiVXRpbHMiLCJkb3dubG9hZEZpbGVGcm9tVVJJIiwidXJpIiwiUHJvbWlzZSIsInJlcyIsInJlaiIsInJlc3BvbnNlIiwic2V0RGVmYXVsdEVuY29kaW5nIiwiYm9keSIsImhlYWRlcnMiLCJvbiIsImRhdGEiLCJtZXNzYWdlIiwiYWRkRmlsZURhdGFJZk5lZWRlZCIsImZpbGUiLCJfc291cmNlIiwiZm9ybWF0IiwiYmFzZTY0IiwiX3ByZXZpb3VzU2F2ZSIsIl9kYXRhIiwiX3JlcXVlc3RUYXNrIiwiRmlsZXNSb3V0ZXIiLCJleHByZXNzUm91dGVyIiwibWF4VXBsb2FkU2l6ZSIsInJvdXRlciIsImV4cHJlc3MiLCJSb3V0ZXIiLCJnZXRIYW5kbGVyIiwibWV0YWRhdGFIYW5kbGVyIiwicG9zdCIsInJlcSIsIm5leHQiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9GSUxFX05BTUUiLCJCb2R5UGFyc2VyIiwicmF3IiwidHlwZSIsImxpbWl0IiwiaGFuZGxlUGFyc2VIZWFkZXJzIiwiaGFuZGxlUGFyc2VTZXNzaW9uIiwiY3JlYXRlSGFuZGxlciIsImRlbGV0ZSIsImVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJkZWxldGVIYW5kbGVyIiwiY29uZmlnIiwiQ29uZmlnIiwicGFyYW1zIiwiYXBwSWQiLCJzdGF0dXMiLCJlcnIiLCJPUEVSQVRJT05fRk9SQklEREVOIiwianNvbiIsImNvZGUiLCJlcnJvciIsImZpbGVzQ29udHJvbGxlciIsImZpbGVuYW1lIiwiY29udGVudFR5cGUiLCJtaW1lIiwiZ2V0VHlwZSIsImlzRmlsZVN0cmVhbWFibGUiLCJoYW5kbGVGaWxlU3RyZWFtIiwiY2F0Y2giLCJlbmQiLCJnZXRGaWxlRGF0YSIsInRoZW4iLCJsZW5ndGgiLCJfY29uZmlnJGZpbGVVcGxvYWQiLCJ1c2VyIiwiYXV0aCIsImlzTWFzdGVyIiwiaXNMaW5rZWQiLCJBbm9ueW1vdXNVdGlscyIsImZpbGVVcGxvYWQiLCJlbmFibGVGb3JBbm9ueW1vdXNVc2VyIiwiRklMRV9TQVZFX0VSUk9SIiwiZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIiLCJlbmFibGVGb3JQdWJsaWMiLCJ2YWxpZGF0ZUZpbGVuYW1lIiwiZmlsZUV4dGVuc2lvbnMiLCJfZXh0ZW5zaW9uIiwiaXNWYWxpZEV4dGVuc2lvbiIsImV4dGVuc2lvbiIsInNvbWUiLCJleHQiLCJyZWdleCIsIlJlZ0V4cCIsInRlc3QiLCJpbmNsdWRlcyIsInN1YnN0cmluZyIsImxhc3RJbmRleE9mIiwic3BsaXQiLCJqb2luIiwidG9TdHJpbmciLCJGaWxlIiwibWV0YWRhdGEiLCJ0YWdzIiwiZmlsZURhdGEiLCJjaGVja1Byb2hpYml0ZWRLZXl3b3JkcyIsIklOVkFMSURfS0VZX05BTUUiLCJzZXRUYWdzIiwic2V0TWV0YWRhdGEiLCJmaWxlU2l6ZSIsIkJ1ZmZlciIsImJ5dGVMZW5ndGgiLCJmaWxlT2JqZWN0IiwidHJpZ2dlclJlc3VsdCIsIm1heWJlUnVuRmlsZVRyaWdnZXIiLCJUeXBlcyIsImJlZm9yZVNhdmUiLCJzYXZlUmVzdWx0IiwidXJsIiwibmFtZSIsIl9uYW1lIiwiYnVmZmVyRGF0YSIsImZyb20iLCJmaWxlT3B0aW9ucyIsIl9tZXRhZGF0YSIsImZpbGVUYWdzIiwia2V5cyIsIl90YWdzIiwiYXNzaWduIiwiY3JlYXRlRmlsZVJlc3VsdCIsImNyZWF0ZUZpbGUiLCJfdXJsIiwicmVzb2x2ZSIsImFmdGVyU2F2ZSIsImxvZ2dlciIsInJlc29sdmVFcnJvciIsImFkYXB0ZXIiLCJnZXRGaWxlTG9jYXRpb24iLCJiZWZvcmVEZWxldGUiLCJkZWxldGVGaWxlIiwiYWZ0ZXJEZWxldGUiLCJGSUxFX0RFTEVURV9FUlJPUiIsImdldE1ldGFkYXRhIiwiZXhwb3J0cyIsInJhbmdlIiwic3RhcnQiLCJOdW1iZXIiLCJpc05hTiJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0ZpbGVzUm91dGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBleHByZXNzIGZyb20gJ2V4cHJlc3MnO1xuaW1wb3J0IEJvZHlQYXJzZXIgZnJvbSAnYm9keS1wYXJzZXInO1xuaW1wb3J0ICogYXMgTWlkZGxld2FyZXMgZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IG1pbWUgZnJvbSAnbWltZSc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5jb25zdCB0cmlnZ2VycyA9IHJlcXVpcmUoJy4uL3RyaWdnZXJzJyk7XG5jb25zdCBodHRwID0gcmVxdWlyZSgnaHR0cCcpO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuLi9VdGlscycpO1xuXG5jb25zdCBkb3dubG9hZEZpbGVGcm9tVVJJID0gdXJpID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXMsIHJlaikgPT4ge1xuICAgIGh0dHBcbiAgICAgIC5nZXQodXJpLCByZXNwb25zZSA9PiB7XG4gICAgICAgIHJlc3BvbnNlLnNldERlZmF1bHRFbmNvZGluZygnYmFzZTY0Jyk7XG4gICAgICAgIGxldCBib2R5ID0gYGRhdGE6JHtyZXNwb25zZS5oZWFkZXJzWydjb250ZW50LXR5cGUnXX07YmFzZTY0LGA7XG4gICAgICAgIHJlc3BvbnNlLm9uKCdkYXRhJywgZGF0YSA9PiAoYm9keSArPSBkYXRhKSk7XG4gICAgICAgIHJlc3BvbnNlLm9uKCdlbmQnLCAoKSA9PiByZXMoYm9keSkpO1xuICAgICAgfSlcbiAgICAgIC5vbignZXJyb3InLCBlID0+IHtcbiAgICAgICAgcmVqKGBFcnJvciBkb3dubG9hZGluZyBmaWxlIGZyb20gJHt1cml9OiAke2UubWVzc2FnZX1gKTtcbiAgICAgIH0pO1xuICB9KTtcbn07XG5cbmNvbnN0IGFkZEZpbGVEYXRhSWZOZWVkZWQgPSBhc3luYyBmaWxlID0+IHtcbiAgaWYgKGZpbGUuX3NvdXJjZS5mb3JtYXQgPT09ICd1cmknKSB7XG4gICAgY29uc3QgYmFzZTY0ID0gYXdhaXQgZG93bmxvYWRGaWxlRnJvbVVSSShmaWxlLl9zb3VyY2UudXJpKTtcbiAgICBmaWxlLl9wcmV2aW91c1NhdmUgPSBmaWxlO1xuICAgIGZpbGUuX2RhdGEgPSBiYXNlNjQ7XG4gICAgZmlsZS5fcmVxdWVzdFRhc2sgPSBudWxsO1xuICB9XG4gIHJldHVybiBmaWxlO1xufTtcblxuZXhwb3J0IGNsYXNzIEZpbGVzUm91dGVyIHtcbiAgZXhwcmVzc1JvdXRlcih7IG1heFVwbG9hZFNpemUgPSAnMjBNYicgfSA9IHt9KSB7XG4gICAgdmFyIHJvdXRlciA9IGV4cHJlc3MuUm91dGVyKCk7XG4gICAgcm91dGVyLmdldCgnL2ZpbGVzLzphcHBJZC86ZmlsZW5hbWUnLCB0aGlzLmdldEhhbmRsZXIpO1xuICAgIHJvdXRlci5nZXQoJy9maWxlcy86YXBwSWQvbWV0YWRhdGEvOmZpbGVuYW1lJywgdGhpcy5tZXRhZGF0YUhhbmRsZXIpO1xuXG4gICAgcm91dGVyLnBvc3QoJy9maWxlcycsIGZ1bmN0aW9uIChyZXEsIHJlcywgbmV4dCkge1xuICAgICAgbmV4dChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsICdGaWxlbmFtZSBub3QgcHJvdmlkZWQuJykpO1xuICAgIH0pO1xuXG4gICAgcm91dGVyLnBvc3QoXG4gICAgICAnL2ZpbGVzLzpmaWxlbmFtZScsXG4gICAgICBCb2R5UGFyc2VyLnJhdyh7XG4gICAgICAgIHR5cGU6ICgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgbGltaXQ6IG1heFVwbG9hZFNpemUsXG4gICAgICB9KSwgLy8gQWxsb3cgdXBsb2FkcyB3aXRob3V0IENvbnRlbnQtVHlwZSwgb3Igd2l0aCBhbnkgQ29udGVudC1UeXBlLlxuICAgICAgTWlkZGxld2FyZXMuaGFuZGxlUGFyc2VIZWFkZXJzLFxuICAgICAgTWlkZGxld2FyZXMuaGFuZGxlUGFyc2VTZXNzaW9uLFxuICAgICAgdGhpcy5jcmVhdGVIYW5kbGVyXG4gICAgKTtcblxuICAgIHJvdXRlci5kZWxldGUoXG4gICAgICAnL2ZpbGVzLzpmaWxlbmFtZScsXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUhlYWRlcnMsXG4gICAgICBNaWRkbGV3YXJlcy5oYW5kbGVQYXJzZVNlc3Npb24sXG4gICAgICBNaWRkbGV3YXJlcy5lbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgdGhpcy5kZWxldGVIYW5kbGVyXG4gICAgKTtcbiAgICByZXR1cm4gcm91dGVyO1xuICB9XG5cbiAgZ2V0SGFuZGxlcihyZXEsIHJlcykge1xuICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQocmVxLnBhcmFtcy5hcHBJZCk7XG4gICAgaWYgKCFjb25maWcpIHtcbiAgICAgIHJlcy5zdGF0dXMoNDAzKTtcbiAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCAnSW52YWxpZCBhcHBsaWNhdGlvbiBJRC4nKTtcbiAgICAgIHJlcy5qc29uKHsgY29kZTogZXJyLmNvZGUsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZmlsZXNDb250cm9sbGVyID0gY29uZmlnLmZpbGVzQ29udHJvbGxlcjtcbiAgICBjb25zdCBmaWxlbmFtZSA9IHJlcS5wYXJhbXMuZmlsZW5hbWU7XG4gICAgY29uc3QgY29udGVudFR5cGUgPSBtaW1lLmdldFR5cGUoZmlsZW5hbWUpO1xuICAgIGlmIChpc0ZpbGVTdHJlYW1hYmxlKHJlcSwgZmlsZXNDb250cm9sbGVyKSkge1xuICAgICAgZmlsZXNDb250cm9sbGVyLmhhbmRsZUZpbGVTdHJlYW0oY29uZmlnLCBmaWxlbmFtZSwgcmVxLCByZXMsIGNvbnRlbnRUeXBlKS5jYXRjaCgoKSA9PiB7XG4gICAgICAgIHJlcy5zdGF0dXMoNDA0KTtcbiAgICAgICAgcmVzLnNldCgnQ29udGVudC1UeXBlJywgJ3RleHQvcGxhaW4nKTtcbiAgICAgICAgcmVzLmVuZCgnRmlsZSBub3QgZm91bmQuJyk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgZmlsZXNDb250cm9sbGVyXG4gICAgICAgIC5nZXRGaWxlRGF0YShjb25maWcsIGZpbGVuYW1lKVxuICAgICAgICAudGhlbihkYXRhID0+IHtcbiAgICAgICAgICByZXMuc3RhdHVzKDIwMCk7XG4gICAgICAgICAgcmVzLnNldCgnQ29udGVudC1UeXBlJywgY29udGVudFR5cGUpO1xuICAgICAgICAgIHJlcy5zZXQoJ0NvbnRlbnQtTGVuZ3RoJywgZGF0YS5sZW5ndGgpO1xuICAgICAgICAgIHJlcy5lbmQoZGF0YSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgcmVzLnN0YXR1cyg0MDQpO1xuICAgICAgICAgIHJlcy5zZXQoJ0NvbnRlbnQtVHlwZScsICd0ZXh0L3BsYWluJyk7XG4gICAgICAgICAgcmVzLmVuZCgnRmlsZSBub3QgZm91bmQuJyk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUhhbmRsZXIocmVxLCByZXMsIG5leHQpIHtcbiAgICBjb25zdCBjb25maWcgPSByZXEuY29uZmlnO1xuICAgIGNvbnN0IHVzZXIgPSByZXEuYXV0aC51c2VyO1xuICAgIGNvbnN0IGlzTWFzdGVyID0gcmVxLmF1dGguaXNNYXN0ZXI7XG4gICAgY29uc3QgaXNMaW5rZWQgPSB1c2VyICYmIFBhcnNlLkFub255bW91c1V0aWxzLmlzTGlua2VkKHVzZXIpO1xuICAgIGlmICghaXNNYXN0ZXIgJiYgIWNvbmZpZy5maWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgJiYgaXNMaW5rZWQpIHtcbiAgICAgIG5leHQoXG4gICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsICdGaWxlIHVwbG9hZCBieSBhbm9ueW1vdXMgdXNlciBpcyBkaXNhYmxlZC4nKVxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFpc01hc3RlciAmJiAhY29uZmlnLmZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgJiYgIWlzTGlua2VkICYmIHVzZXIpIHtcbiAgICAgIG5leHQoXG4gICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsXG4gICAgICAgICAgJ0ZpbGUgdXBsb2FkIGJ5IGF1dGhlbnRpY2F0ZWQgdXNlciBpcyBkaXNhYmxlZC4nXG4gICAgICAgIClcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghaXNNYXN0ZXIgJiYgIWNvbmZpZy5maWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyAmJiAhdXNlcikge1xuICAgICAgbmV4dChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCAnRmlsZSB1cGxvYWQgYnkgcHVibGljIGlzIGRpc2FibGVkLicpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZmlsZXNDb250cm9sbGVyID0gY29uZmlnLmZpbGVzQ29udHJvbGxlcjtcbiAgICBjb25zdCB7IGZpbGVuYW1lIH0gPSByZXEucGFyYW1zO1xuICAgIGNvbnN0IGNvbnRlbnRUeXBlID0gcmVxLmdldCgnQ29udGVudC10eXBlJyk7XG5cbiAgICBpZiAoIXJlcS5ib2R5IHx8ICFyZXEuYm9keS5sZW5ndGgpIHtcbiAgICAgIG5leHQobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUiwgJ0ludmFsaWQgZmlsZSB1cGxvYWQuJykpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGVycm9yID0gZmlsZXNDb250cm9sbGVyLnZhbGlkYXRlRmlsZW5hbWUoZmlsZW5hbWUpO1xuICAgIGlmIChlcnJvcikge1xuICAgICAgbmV4dChlcnJvcik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZmlsZUV4dGVuc2lvbnMgPSBjb25maWcuZmlsZVVwbG9hZD8uZmlsZUV4dGVuc2lvbnM7XG4gICAgaWYgKCFpc01hc3RlciAmJiBmaWxlRXh0ZW5zaW9ucykge1xuICAgICAgY29uc3QgaXNWYWxpZEV4dGVuc2lvbiA9IGV4dGVuc2lvbiA9PiB7XG4gICAgICAgIHJldHVybiBmaWxlRXh0ZW5zaW9ucy5zb21lKGV4dCA9PiB7XG4gICAgICAgICAgaWYgKGV4dCA9PT0gJyonKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKGV4dCk7XG4gICAgICAgICAgaWYgKHJlZ2V4LnRlc3QoZXh0ZW5zaW9uKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH07XG4gICAgICBsZXQgZXh0ZW5zaW9uID0gY29udGVudFR5cGU7XG4gICAgICBpZiAoZmlsZW5hbWUgJiYgZmlsZW5hbWUuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICBleHRlbnNpb24gPSBmaWxlbmFtZS5zdWJzdHJpbmcoZmlsZW5hbWUubGFzdEluZGV4T2YoJy4nKSArIDEpO1xuICAgICAgfSBlbHNlIGlmIChjb250ZW50VHlwZSAmJiBjb250ZW50VHlwZS5pbmNsdWRlcygnLycpKSB7XG4gICAgICAgIGV4dGVuc2lvbiA9IGNvbnRlbnRUeXBlLnNwbGl0KCcvJylbMV07XG4gICAgICB9XG4gICAgICBleHRlbnNpb24gPSBleHRlbnNpb24/LnNwbGl0KCcgJyk/LmpvaW4oJycpO1xuXG4gICAgICBpZiAoZXh0ZW5zaW9uICYmICFpc1ZhbGlkRXh0ZW5zaW9uKGV4dGVuc2lvbikpIHtcbiAgICAgICAgbmV4dChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsXG4gICAgICAgICAgICBgRmlsZSB1cGxvYWQgb2YgZXh0ZW5zaW9uICR7ZXh0ZW5zaW9ufSBpcyBkaXNhYmxlZC5gXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgYmFzZTY0ID0gcmVxLmJvZHkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgIGNvbnN0IGZpbGUgPSBuZXcgUGFyc2UuRmlsZShmaWxlbmFtZSwgeyBiYXNlNjQgfSwgY29udGVudFR5cGUpO1xuICAgIGNvbnN0IHsgbWV0YWRhdGEgPSB7fSwgdGFncyA9IHt9IH0gPSByZXEuZmlsZURhdGEgfHwge307XG4gICAgdHJ5IHtcbiAgICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICAgIFV0aWxzLmNoZWNrUHJvaGliaXRlZEtleXdvcmRzKGNvbmZpZywgbWV0YWRhdGEpO1xuICAgICAgVXRpbHMuY2hlY2tQcm9oaWJpdGVkS2V5d29yZHMoY29uZmlnLCB0YWdzKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbmV4dChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgZXJyb3IpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZmlsZS5zZXRUYWdzKHRhZ3MpO1xuICAgIGZpbGUuc2V0TWV0YWRhdGEobWV0YWRhdGEpO1xuICAgIGNvbnN0IGZpbGVTaXplID0gQnVmZmVyLmJ5dGVMZW5ndGgocmVxLmJvZHkpO1xuICAgIGNvbnN0IGZpbGVPYmplY3QgPSB7IGZpbGUsIGZpbGVTaXplIH07XG4gICAgdHJ5IHtcbiAgICAgIC8vIHJ1biBiZWZvcmVTYXZlRmlsZSB0cmlnZ2VyXG4gICAgICBjb25zdCB0cmlnZ2VyUmVzdWx0ID0gYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICAgICAgZmlsZU9iamVjdCxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICByZXEuYXV0aFxuICAgICAgKTtcbiAgICAgIGxldCBzYXZlUmVzdWx0O1xuICAgICAgLy8gaWYgYSBuZXcgUGFyc2VGaWxlIGlzIHJldHVybmVkIGNoZWNrIGlmIGl0J3MgYW4gYWxyZWFkeSBzYXZlZCBmaWxlXG4gICAgICBpZiAodHJpZ2dlclJlc3VsdCBpbnN0YW5jZW9mIFBhcnNlLkZpbGUpIHtcbiAgICAgICAgZmlsZU9iamVjdC5maWxlID0gdHJpZ2dlclJlc3VsdDtcbiAgICAgICAgaWYgKHRyaWdnZXJSZXN1bHQudXJsKCkpIHtcbiAgICAgICAgICAvLyBzZXQgZmlsZVNpemUgdG8gbnVsbCBiZWNhdXNlIHdlIHdvbnQga25vdyBob3cgYmlnIGl0IGlzIGhlcmVcbiAgICAgICAgICBmaWxlT2JqZWN0LmZpbGVTaXplID0gbnVsbDtcbiAgICAgICAgICBzYXZlUmVzdWx0ID0ge1xuICAgICAgICAgICAgdXJsOiB0cmlnZ2VyUmVzdWx0LnVybCgpLFxuICAgICAgICAgICAgbmFtZTogdHJpZ2dlclJlc3VsdC5fbmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBpZiB0aGUgZmlsZSByZXR1cm5lZCBieSB0aGUgdHJpZ2dlciBoYXMgYWxyZWFkeSBiZWVuIHNhdmVkIHNraXAgc2F2aW5nIGFueXRoaW5nXG4gICAgICBpZiAoIXNhdmVSZXN1bHQpIHtcbiAgICAgICAgLy8gaWYgdGhlIFBhcnNlRmlsZSByZXR1cm5lZCBpcyB0eXBlIHVyaSwgZG93bmxvYWQgdGhlIGZpbGUgYmVmb3JlIHNhdmluZyBpdFxuICAgICAgICBhd2FpdCBhZGRGaWxlRGF0YUlmTmVlZGVkKGZpbGVPYmplY3QuZmlsZSk7XG4gICAgICAgIC8vIHVwZGF0ZSBmaWxlU2l6ZVxuICAgICAgICBjb25zdCBidWZmZXJEYXRhID0gQnVmZmVyLmZyb20oZmlsZU9iamVjdC5maWxlLl9kYXRhLCAnYmFzZTY0Jyk7XG4gICAgICAgIGZpbGVPYmplY3QuZmlsZVNpemUgPSBCdWZmZXIuYnl0ZUxlbmd0aChidWZmZXJEYXRhKTtcbiAgICAgICAgLy8gcHJlcGFyZSBmaWxlIG9wdGlvbnNcbiAgICAgICAgY29uc3QgZmlsZU9wdGlvbnMgPSB7XG4gICAgICAgICAgbWV0YWRhdGE6IGZpbGVPYmplY3QuZmlsZS5fbWV0YWRhdGEsXG4gICAgICAgIH07XG4gICAgICAgIC8vIHNvbWUgczMtY29tcGF0aWJsZSBwcm92aWRlcnMgKERpZ2l0YWxPY2VhbiwgTGlub2RlKSBkbyBub3QgYWNjZXB0IHRhZ3NcbiAgICAgICAgLy8gc28gd2UgZG8gbm90IGluY2x1ZGUgdGhlIHRhZ3Mgb3B0aW9uIGlmIGl0IGlzIGVtcHR5LlxuICAgICAgICBjb25zdCBmaWxlVGFncyA9XG4gICAgICAgICAgT2JqZWN0LmtleXMoZmlsZU9iamVjdC5maWxlLl90YWdzKS5sZW5ndGggPiAwID8geyB0YWdzOiBmaWxlT2JqZWN0LmZpbGUuX3RhZ3MgfSA6IHt9O1xuICAgICAgICBPYmplY3QuYXNzaWduKGZpbGVPcHRpb25zLCBmaWxlVGFncyk7XG4gICAgICAgIC8vIHNhdmUgZmlsZVxuICAgICAgICBjb25zdCBjcmVhdGVGaWxlUmVzdWx0ID0gYXdhaXQgZmlsZXNDb250cm9sbGVyLmNyZWF0ZUZpbGUoXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGZpbGVPYmplY3QuZmlsZS5fbmFtZSxcbiAgICAgICAgICBidWZmZXJEYXRhLFxuICAgICAgICAgIGZpbGVPYmplY3QuZmlsZS5fc291cmNlLnR5cGUsXG4gICAgICAgICAgZmlsZU9wdGlvbnNcbiAgICAgICAgKTtcbiAgICAgICAgLy8gdXBkYXRlIGZpbGUgd2l0aCBuZXcgZGF0YVxuICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX25hbWUgPSBjcmVhdGVGaWxlUmVzdWx0Lm5hbWU7XG4gICAgICAgIGZpbGVPYmplY3QuZmlsZS5fdXJsID0gY3JlYXRlRmlsZVJlc3VsdC51cmw7XG4gICAgICAgIGZpbGVPYmplY3QuZmlsZS5fcmVxdWVzdFRhc2sgPSBudWxsO1xuICAgICAgICBmaWxlT2JqZWN0LmZpbGUuX3ByZXZpb3VzU2F2ZSA9IFByb21pc2UucmVzb2x2ZShmaWxlT2JqZWN0LmZpbGUpO1xuICAgICAgICBzYXZlUmVzdWx0ID0ge1xuICAgICAgICAgIHVybDogY3JlYXRlRmlsZVJlc3VsdC51cmwsXG4gICAgICAgICAgbmFtZTogY3JlYXRlRmlsZVJlc3VsdC5uYW1lLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgLy8gcnVuIGFmdGVyU2F2ZUZpbGUgdHJpZ2dlclxuICAgICAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcih0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsIGZpbGVPYmplY3QsIGNvbmZpZywgcmVxLmF1dGgpO1xuICAgICAgcmVzLnN0YXR1cygyMDEpO1xuICAgICAgcmVzLnNldCgnTG9jYXRpb24nLCBzYXZlUmVzdWx0LnVybCk7XG4gICAgICByZXMuanNvbihzYXZlUmVzdWx0KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGNyZWF0aW5nIGEgZmlsZTogJywgZSk7XG4gICAgICBjb25zdCBlcnJvciA9IHRyaWdnZXJzLnJlc29sdmVFcnJvcihlLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLkZJTEVfU0FWRV9FUlJPUixcbiAgICAgICAgbWVzc2FnZTogYENvdWxkIG5vdCBzdG9yZSBmaWxlOiAke2ZpbGVPYmplY3QuZmlsZS5fbmFtZX0uYCxcbiAgICAgIH0pO1xuICAgICAgbmV4dChlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZGVsZXRlSGFuZGxlcihyZXEsIHJlcywgbmV4dCkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IGZpbGVzQ29udHJvbGxlciB9ID0gcmVxLmNvbmZpZztcbiAgICAgIGNvbnN0IHsgZmlsZW5hbWUgfSA9IHJlcS5wYXJhbXM7XG4gICAgICAvLyBydW4gYmVmb3JlRGVsZXRlRmlsZSB0cmlnZ2VyXG4gICAgICBjb25zdCBmaWxlID0gbmV3IFBhcnNlLkZpbGUoZmlsZW5hbWUpO1xuICAgICAgZmlsZS5fdXJsID0gZmlsZXNDb250cm9sbGVyLmFkYXB0ZXIuZ2V0RmlsZUxvY2F0aW9uKHJlcS5jb25maWcsIGZpbGVuYW1lKTtcbiAgICAgIGNvbnN0IGZpbGVPYmplY3QgPSB7IGZpbGUsIGZpbGVTaXplOiBudWxsIH07XG4gICAgICBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1bkZpbGVUcmlnZ2VyKFxuICAgICAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVEZWxldGUsXG4gICAgICAgIGZpbGVPYmplY3QsXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIHJlcS5hdXRoXG4gICAgICApO1xuICAgICAgLy8gZGVsZXRlIGZpbGVcbiAgICAgIGF3YWl0IGZpbGVzQ29udHJvbGxlci5kZWxldGVGaWxlKHJlcS5jb25maWcsIGZpbGVuYW1lKTtcbiAgICAgIC8vIHJ1biBhZnRlckRlbGV0ZUZpbGUgdHJpZ2dlclxuICAgICAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5GaWxlVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJEZWxldGUsXG4gICAgICAgIGZpbGVPYmplY3QsXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIHJlcS5hdXRoXG4gICAgICApO1xuICAgICAgcmVzLnN0YXR1cygyMDApO1xuICAgICAgLy8gVE9ETzogcmV0dXJuIHVzZWZ1bCBKU09OIGhlcmU/XG4gICAgICByZXMuZW5kKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLmVycm9yKCdFcnJvciBkZWxldGluZyBhIGZpbGU6ICcsIGUpO1xuICAgICAgY29uc3QgZXJyb3IgPSB0cmlnZ2Vycy5yZXNvbHZlRXJyb3IoZSwge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5GSUxFX0RFTEVURV9FUlJPUixcbiAgICAgICAgbWVzc2FnZTogJ0NvdWxkIG5vdCBkZWxldGUgZmlsZS4nLFxuICAgICAgfSk7XG4gICAgICBuZXh0KGVycm9yKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBtZXRhZGF0YUhhbmRsZXIocmVxLCByZXMpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChyZXEucGFyYW1zLmFwcElkKTtcbiAgICAgIGNvbnN0IHsgZmlsZXNDb250cm9sbGVyIH0gPSBjb25maWc7XG4gICAgICBjb25zdCB7IGZpbGVuYW1lIH0gPSByZXEucGFyYW1zO1xuICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IGZpbGVzQ29udHJvbGxlci5nZXRNZXRhZGF0YShmaWxlbmFtZSk7XG4gICAgICByZXMuc3RhdHVzKDIwMCk7XG4gICAgICByZXMuanNvbihkYXRhKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXMuc3RhdHVzKDIwMCk7XG4gICAgICByZXMuanNvbih7fSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGlzRmlsZVN0cmVhbWFibGUocmVxLCBmaWxlc0NvbnRyb2xsZXIpIHtcbiAgY29uc3QgcmFuZ2UgPSAocmVxLmdldCgnUmFuZ2UnKSB8fCAnLy0vJykuc3BsaXQoJy0nKTtcbiAgY29uc3Qgc3RhcnQgPSBOdW1iZXIocmFuZ2VbMF0pO1xuICBjb25zdCBlbmQgPSBOdW1iZXIocmFuZ2VbMV0pO1xuICByZXR1cm4gKFxuICAgICghaXNOYU4oc3RhcnQpIHx8ICFpc05hTihlbmQpKSAmJiB0eXBlb2YgZmlsZXNDb250cm9sbGVyLmFkYXB0ZXIuaGFuZGxlRmlsZVN0cmVhbSA9PT0gJ2Z1bmN0aW9uJ1xuICApO1xufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxRQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxXQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxXQUFBLEdBQUFDLHVCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBSSxLQUFBLEdBQUFMLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSyxPQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTSxLQUFBLEdBQUFQLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTyxPQUFBLEdBQUFSLHNCQUFBLENBQUFDLE9BQUE7QUFBK0IsU0FBQVEseUJBQUFDLENBQUEsNkJBQUFDLE9BQUEsbUJBQUFDLENBQUEsT0FBQUQsT0FBQSxJQUFBRSxDQUFBLE9BQUFGLE9BQUEsWUFBQUYsd0JBQUEsWUFBQUEsQ0FBQUMsQ0FBQSxXQUFBQSxDQUFBLEdBQUFHLENBQUEsR0FBQUQsQ0FBQSxLQUFBRixDQUFBO0FBQUEsU0FBQU4sd0JBQUFNLENBQUEsRUFBQUUsQ0FBQSxTQUFBQSxDQUFBLElBQUFGLENBQUEsSUFBQUEsQ0FBQSxDQUFBSSxVQUFBLFNBQUFKLENBQUEsZUFBQUEsQ0FBQSx1QkFBQUEsQ0FBQSx5QkFBQUEsQ0FBQSxXQUFBSyxPQUFBLEVBQUFMLENBQUEsUUFBQUcsQ0FBQSxHQUFBSix3QkFBQSxDQUFBRyxDQUFBLE9BQUFDLENBQUEsSUFBQUEsQ0FBQSxDQUFBRyxHQUFBLENBQUFOLENBQUEsVUFBQUcsQ0FBQSxDQUFBSSxHQUFBLENBQUFQLENBQUEsT0FBQVEsQ0FBQSxLQUFBQyxTQUFB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