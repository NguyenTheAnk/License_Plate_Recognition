const express = require('express');
const router = express.Router();
const videoController = require('../controllers/uploadVideo');
const upload = require('../controllers/uploadVideo').upload;

router.post('/upload-video', upload.single('video'), videoController.uploadVideo);
router.get('/list-videos', videoController.listVideos);

module.exports = router;