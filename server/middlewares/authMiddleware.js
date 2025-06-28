const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, msg: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JSON_WEB_TOKEN_SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, msg: 'Invalid or expired token' });
  }
};
