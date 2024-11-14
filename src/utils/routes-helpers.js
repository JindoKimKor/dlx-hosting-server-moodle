const path = require("path");
const { logError } = require("../logger.js");

// Method that asynchronously sends a file in response to an HTTP request.
const sendFileResponse = async (req, res, fileDir) => {
  try {
    await res.sendFile(path.join(__dirname, fileDir), (err) => {
      err && logError(req, res, err);
    });
  } catch (err) {
    logError(req, res, err);
  }
};

const sendDLXResponse = async (req, res, fileDir) => {
  try{
    await res.sendFile(fileDir, (err) => {
      err && logError(req, res, err);
    });
  } catch (err) {
    logError(req, res, err);
  }
};

module.exports = { sendFileResponse, sendDLXResponse };
