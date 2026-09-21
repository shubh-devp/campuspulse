const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB per image
const MAX_FILES = 5;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const CLOUDINARY_FOLDER = 'campuspulse/complaints';

// Create the folder on startup so the first upload cannot fail
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Images go to Cloudinary when its credentials are set. Without them the app keeps
// storing on local disk, which is what local development uses. dotenv is loaded in
// server.js before this module is required, so the values are already in place.
function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

// multer needs the file on disk because the Python image classifier reads it by path
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  // Unique name: timestamp + random number + the original extension
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
  },
});

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(null, true);
  }
  cb(new Error('Only JPEG and PNG images are allowed'));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
});

// Wraps multer so upload problems come back as a clean 400 instead of a 500
function uploadImages(req, res, next) {
  upload.array('images', MAX_FILES)(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Each image must be 5 MB or smaller' });
    }
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: `You can upload up to ${MAX_FILES} images` });
    }
    return res.status(400).json({ message: error.message });
  });
}

// Removes the cloud copies of the given files, if any of them reached Cloudinary
async function destroyCloudinaryFiles(files) {
  if (!isCloudinaryConfigured()) {
    return;
  }

  await Promise.all(
    (files || [])
      .filter((file) => file.cloudinary_public_id)
      .map((file) => cloudinary.uploader.destroy(file.cloudinary_public_id).catch(() => {}))
  );
}

// Stores the uploads and returns one { url } per file, in the same order the files
// arrived in. On Cloudinary the public id is kept on the file object so the image
// can be removed again if the complaint cannot be saved.
async function persistImages(files) {
  if (!files || files.length === 0) {
    return [];
  }

  // Local disk: the file is already where it needs to be
  if (!isCloudinaryConfigured()) {
    return files.map((file) => ({ url: `/uploads/${file.filename}` }));
  }

  const stored = [];

  try {
    for (const file of files) {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: CLOUDINARY_FOLDER,
        resource_type: 'image',
      });

      file.cloudinary_public_id = result.public_id;
      stored.push({ url: result.secure_url });
    }
  } catch (error) {
    // Nothing is saved yet, so whatever made it to Cloudinary is cleaned up again
    await destroyCloudinaryFiles(files);
    throw error;
  }

  return stored;
}

// Called once the complaint is safely stored: for an image that already lives on
// Cloudinary the local copy would only be taking up room on disk
async function finalizeUploads(files) {
  await Promise.all(
    (files || [])
      .filter((file) => file.cloudinary_public_id)
      .map((file) => fs.promises.unlink(file.path).catch(() => {}))
  );
}

// Used when a complaint is rejected or fails to save, so no image is left behind
async function deleteUploadedFiles(files) {
  if (!files || files.length === 0) {
    return;
  }

  await destroyCloudinaryFiles(files);
  await Promise.all(files.map((file) => fs.promises.unlink(file.path).catch(() => {})));
}

module.exports = {
  uploadImages,
  persistImages,
  finalizeUploads,
  deleteUploadedFiles,
  UPLOAD_DIR,
};
