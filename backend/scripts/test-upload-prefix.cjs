const assert = require('node:assert/strict');
const path = require('node:path');

process.env.PUBLIC_UPLOADS_PREFIX = '/rightnow-uploads/';
const {
  PUBLIC_UPLOADS_PREFIX,
  UPLOADS_DIR,
  buildUploadUrl,
  resolveLocalUploadPath,
} = require('../dist/common/upload.util.js');

assert.equal(PUBLIC_UPLOADS_PREFIX, '/rightnow-uploads');
assert.equal(buildUploadUrl('photo.png'), '/rightnow-uploads/photo.png');
assert.equal(resolveLocalUploadPath('/rightnow-uploads/photo.png'), path.join(UPLOADS_DIR, 'photo.png'));
assert.equal(resolveLocalUploadPath('/uploads/legacy.png'), path.join(UPLOADS_DIR, 'legacy.png'));
assert.equal(resolveLocalUploadPath('/rightnow-uploads/../secret'), null);
assert.equal(resolveLocalUploadPath('/other/photo.png'), null);

console.log('Upload prefix contract: 6 assertions passed');
