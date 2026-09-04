import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// multer gives us the file as an in-memory Buffer (no disk writes — Vercel's
// filesystem is read-only/ephemeral outside /tmp), so we stream that buffer
// straight to Cloudinary instead of writing it to disk first.
export const uploadBufferToCloudinary = (buffer, { folder, resourceType = 'auto', filename }) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        filename_override: filename,
        use_filename: true,
        unique_filename: true,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });

export const deleteFromCloudinary = (publicId, resourceType = 'raw') =>
  cloudinary.uploader.destroy(publicId, { resource_type: resourceType });

export default cloudinary;
