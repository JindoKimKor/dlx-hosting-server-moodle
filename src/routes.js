const router = require("express").Router();
const path = require("path");
const mongoose = require("mongoose");
const { logger, logError } = require("./logger.js");
const { sendFileResponse } = require("./utils/routes-helpers.js");
const { sendDLXResponse } = require("./utils/routes-helpers.js");
const {
  getContentsByCourse,
  getContentByParam,
  getFolderNames,
  updateMongoDB,
} = require("./utils/mongodb-util.js");
const Model = require("./models/model.js");
mongoose.connect(process.env.DB_URL);
const database = mongoose.connection;
const provMainDebug = require('debug')('provider:main');

// Requiring Ltijs
const lti = require("ltijs").Provider;

// Dynamic routing for dlx
router.get("/dlx/:param", async (req, res) => {
  const param = req.params.param;
  // Insert ltik into the cookie
  res.cookie("ltik", res.locals.ltik, {
    secure: true,
    httpOnly: false,
    sameSite: "None",
  });

  // Create 'names_and_roles' cookie
  // This cookie will include all members information who are enrolled in a course
  const response = await lti.NamesAndRoles.getMembers(res.locals.token) // Gets context members
  res.cookie("names_and_roles", response, {
    secure: true,
    httpOnly: false,
    sameSite: "None",
  });
  const content = await getContentByParam(param);
  
  // When content does not exist
  if (!content) return res.send("Not Found");

  // For testing
  if (param.includes("testing")) return res.send("success");

  // For local dlxs
  // return sendFileResponse(req, res, `../../public/${content.param}/index.html`);
  return sendDLXResponse(req, res, `/var/www/html/${content.param}/index.html`);
});

router.post("/mpcl1/submitGrade", async (req, res) => {
  var obj = {
    userID: res.locals.token.user,
    lastCompletedGrade: req.body.completionStatus,
    simID: res.locals.token.deploymentId,
    gradeWasSubmitted: false,
    timeCompleted: new Date(),
  };

  var findQuery = {
    userID: res.locals.token.user,
    simID: res.locals.token.deploymentId,
  };

  var foundModel = await Model.findOne(findQuery);

  if (!foundModel) {
    var foundModel = new Model(obj);
    foundModel.save();
    console.log("saved model");
  } else {
    foundModel.lastCompletedGrade = req.body.completionStatus;
    foundModel.gradeWasSubmitted = false;
    foundModel.timeCompleted = new Date();
    foundModel.save();
    console.log("updated model");
  }

  //start process right away if gradeWasSubmitted is true
  if (req.body.simCompleted) {
    MakeRequestsForAllUnsubmittedSims();
  }

  res.sendStatus(200);
});

//run process every 10 min
setInterval(MakeRequestsForAllUnsubmittedSims, 10 * 60 * 1000);

async function MakeRequestsForAllUnsubmittedSims() {
  console.log("checking");
  var findQuery = { gradeWasSubmitted: false };
  var foundModels = await Model.find(findQuery);

  foundModels.forEach((model) => {
    MakeBrightspaceRequest(model);

    model.gradeWasSubmitted = true;
    model.save();
  });
}

function MakeBrightspaceRequest(model) {
  console.log(
    `Making Brightspace Request\tgrade: ${model.lastCompletedGrade}\tuser: ${model.userID}`
  );
}

// Grading route
router.post("/grade", async (req, res) => {
  try {
    const idtoken = res.locals.token; // IdToken
    const score = Number(req.body.grade); // User numeric score sent in the body

    // Creating Grade object
    const gradeObj = {
      userId: idtoken.user,
      scoreGiven: score,
      scoreMaximum: 100,
      activityProgress: "Completed",
      gradingProgress: "FullyGraded",
    };

    // Selecting linetItem ID
    let lineItemId = idtoken.platformContext.endpoint.lineitem; // Attempting to retrieve it from idtoken
    if (!lineItemId) {
      logger.info("no lineitem");
    }

    // Sending Grade
    const responseGrade = await lti.Grade.submitScore(
      idtoken,
      lineItemId,
      gradeObj
    );

    return res.send({ message: "Score successfully sent" });
  } catch (err) {
    logError(req, res, err);
    return res.status(500).send({ err: err.message });
  }
});

router.get("/grade/getscore", async (req, res) => {
  // Retrieves grades from a platform, only for the current user
  const idtoken = res.locals.token; // IdToken
  const response = await lti.Grade.getScores(
    idtoken,
    idtoken.platformContext.endpoint.lineitem,
    { userId: idtoken.user }
  );
  return res.send(response);
});

router.get("/grade/getlineitem", async (req, res) => {
  const idtoken = res.locals.token; // IdToken
  try {
    const lineItem = await lti.Grade.getLineItems(idtoken, {
      resourceLinkId: true,
    });
    res
      .status(200)
      .json({ message: "line items retrieved successfully", lineItem });
  } catch (error) {
    logger.error("Error getting line item:", error);
    res.status(500).json({ error: "Failed to get line item" });
  }
});

router.post("/grade/createlineitem", async (req, res) => {
  const idtoken = res.locals.token; // IdToken
  const label = req.body.label; // label sent in the body
  logger.info("Creating new line item");
  try {
    const newLineItem = {
      scoreMaximum: 100,
      label: label,
      tag: "grade",
      resourceLinkId: idtoken.platformContext.resource.id,
    };

    const lineItem = await lti.Grade.createLineItem(idtoken, newLineItem);
    res
      .status(200)
      .json({ message: `Line item ${label} created successfully`, lineItem });
  } catch (error) {
    logger.error("Error creating line item:", error);
    res.status(500).json({ error: "Failed to create line item" });
  }
});

router.post("/grade/deletelineitem", async (req, res) => {
  const idtoken = res.locals.token; // IdToken
  try {
    const lineItem = await lti.Grade.deleteLineItems(idtoken, { tag: "grade" });
    res.status(200).json({
      success: lineItem.success,
      failure: lineItem.failure,
      message: "Lineitem deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting line item:", error);
    res.status(500).json({ message: "Failed to delete line item" });
  }
});

//Get current user
router.get("/currentuser", async(req, res) => {
  res.send(res.locals.token.user);
});

// Names and Roles route
router.get("/members", async (req, res) => {
  try {
    const result = await lti.NamesAndRoles.getMembers(res.locals.token);
    if (result) return res.send(result.members);
    return res.sendStatus(500);
  } catch (err) {
    logError(req, res, err);
    return res.status(500).send(err.message);
  }
});

router.get("/deeplink", async (req, res) => {
  debugger;
  // Add Extra Logs
  const requestLog = {
    query: req.query,
    body: req.body,
    params: req.params,
    headers: req.headers,
    method: req.method,
    url: req.url,
    ip: req.ip
  };
  provMainDebug('Request Form:', JSON.stringify(requestLog, null, 2));

  // return res.sendFile(path.join(__dirname, "../public/dlx-client/index.html"));
  return sendDLXResponse(req, res, `/var/www/html/dlx-client/index.html`);
});


router.get("/deeplink/contents", async (req, res) => {
  debugger;
  const course = res.locals.token.platformContext.context.title;
  // Add Extra Logs
  const requestLog = {
    query: req.query,
    body: req.body,
    params: req.params,
    headers: req.headers,
    method: req.method,
    url: req.url,
    ip: req.ip
  };
  provMainDebug('Request Form:', JSON.stringify(requestLog, null, 2));

  // Update MongoDB before send the 'content list' to LMS
  // Get content list from the 'course' table in MongoDB
  const contents = await updateMongoDB(course).then(() => getContentsByCourse(course));
  
  return res.send(contents);
});

// Deep linking route
router.post("/deeplink", async (req, res) => {
  debugger;
  try {
    // get the resources that the user wants to have links for
    let resources = req.body.dlx;
    
    // Add Extra Logs
    const requestLog = {
    query: req.query,
    body: req.body,
    params: req.params,
    headers: req.headers,
    method: req.method,
    url: req.url,
    ip: req.ip
  };
  provMainDebug('Request Form:', JSON.stringify(requestLog, null, 2));

    // process the resources selected so that the next form can be prepared
    // when a single resource is selected resources is a string
    // when multiple resources are selected it's an iterable
    // when no resources are selected it's undefined
    if (typeof resources === "string") {
      resources = JSON.parse(resources);
    } else if (typeof resources != "undefined") {
      resources.forEach((element, index) => {
        resources[index] = JSON.parse(element);
      });
    }

    // create a form that will be automatically submitted in the users browser
    // the form is submitted to the LMS and used to create the resource links
    const form = await lti.DeepLinking.createDeepLinkingForm(
      res.locals.token,
      resources,
      { message: "Successfully Registered" }
    );
    if (form) return res.send(form);
    return res.sendStatus(500);
  } catch (err) {
    logError(req, res, err);
    return res.status(500).send(err.message);
  }
});

// Get user and context information
router.get("/info", async (req, res) => {
  const token = res.locals.token;
  const context = res.locals.context;

  const info = {};
  if (token.userInfo) {
    if (token.userInfo.name) info.name = token.userInfo.name;
    if (token.userInfo.email) info.email = token.userInfo.email;
  }

  if (context.roles) info.roles = context.roles;
  if (context.context) info.context = context.context;

  return res.send(info);
});

// Wildcard route to deal with redirecting to React routes
router.get("*", (req, res) =>
  res.sendFile(path.join(__dirname, "../public/index.html"))
);

database.on("error", (error) => {
  console.log(error);
});

database.once("connected", () => {
  console.log("Database Connected");
});

module.exports = router;
