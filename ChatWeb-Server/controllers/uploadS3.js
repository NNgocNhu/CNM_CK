const multer = require("multer");
const AWS = require("aws-sdk");
function checkFileType(file, cb) {
  const fileTypes = /jpeg|jpg|png|gif/;

  const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = fileTypes.test(file.mimetype);
  if (extname && mimetype) {
    return cb(null, true);
  }
  return cb("Error: pls upload images /jpeg|jpg|png|gif/ only !");
}
export const uploadImageToS3 = async (req, res, next) => {
  try {
    AWS.config.update({
      region: "ap-southeast-1",
      accessKeyId: "AKIAU6GD3PPUNMDIKWOS",
      secretAccessKey: "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",
    });

    const s3 = new AWS.S3();

    const bucketName = "demo11234";
    const tableName = "Tour";

    //cau hinh multer quan ly upload img
    const storage = multer.memoryStorage({
      destination(req, file, callback) {
        callback(null, "");
      },
    });
    const upload = multer({
      storage,
      limits: { fileSize: 2000000 }, //toi da 2mb
      fileFilter(req, file, cb) {
        checkFileType(file, cb);
      },
    });
    const img = req.file;
    if (!img) {
      console.error("No image received.");
      return res.status(400).send("Vui lòng tải lên một hình ảnh.");
    }
    const fileType = img.originalname.split(".").pop();
    const filePath = `${id}_${Date.now()}.${fileType}`;
    const paramsS3 = {
      Bucket: bucketName,
      Key: filePath,
      Body: img.buffer,
      ContentType: img.mimetype,
    };
    console.log("Uploading image to S3...");
    const data = await s3.upload(paramsS3).promise();
    console.log("Image uploaded successfully:", data.Location);
    return res.json(data.Location);
  } catch (err) {
    //
  }
};
