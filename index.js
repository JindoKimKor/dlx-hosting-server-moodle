
require("dotenv").config();
const path = require("path");
const routes = require("./src/routes");
const { logger } = require("./src/logger");
const lti = require("ltijs").Provider;
const morgan = require("morgan");

// Setup morgan for logging HTTP requests
const httpLoggerMiddleware = (app) => {
  // "dev"- :method :url :status :response-time ms - :res[content-length]
  app.use(morgan("dev", { stream: logger.stream }));
};

// Setup
lti.setup(
  process.env.LTI_KEY,
  {
    url: process.env.DB_URL,
  },
  {
    staticPath: path.join(__dirname, "./public"), // Path to static files
    cookies: {
      secure: true, // Set secure to true if the testing platform is in a different domain and https is being used
      sameSite: "None", // Set sameSite to 'None' if the testing platform is in a different domain and https is being used
    },
    devMode: false, // Set DevMode to true if the testing platform is in a different domain and https is not being used
    serverAddon: httpLoggerMiddleware, // Add middleware
    //dynamic registration
    dynRegRoute: "/register",
    dynReg: {
      url: process.env.URL,
      name: process.env.REG_NAME,
      redirectUris: [
        `${process.env.URL}/dlx/rab`,
        `${process.env.URL}/dlx/mpcl1`,
        `${process.env.URL}/dlx/mpcl2`,
        `${process.env.URL}/dlx/launchtesting`,
        `${process.env.URL}/dlx/reactmultiplayerapp`,
        `${process.env.URL}/dlx/Powerline`,
        `${process.env.URL}/dlx/CORE-Sandbox-V2`,
        `${process.env.URL}/dlx/Public-Health-Inspection`,
        `${process.env.URL}/dlx/Trades-Electrical`,
        `${process.env.URL}/dlx/Paramedic-Ambulance`,
        `${process.env.URL}/dlx/LTI-Package-Test`,
        `${process.env.URL}/dlx/EcoQuorum`,
        `${process.env.URL}/dlx/Photogrammetry`
      ],
      autoActivate: true,
      useDeepLinking: false,
    },
  }
);

lti.onDynamicRegistration(async (req, res, next) => {
  try {
    if (!req.query.openid_configuration)
      return res.status(400).send({
        status: 400,
        error: "Bad Request",
        details: { message: 'Missing parameter: "openid_configuration".' },
      });
    const message = await lti.DynamicRegistration.register(
      req.query.openid_configuration,
      req.query.registration_token
    );
    res.setHeader("Content-type", "text/html");
    res.send(message);
  } catch (err) {
    if (err.message === "PLATFORM_ALREADY_REGISTERED")
      return res.status(403).send({
        status: 403,
        error: "Forbidden",
        details: { message: "Platform already registered." },
      });
    return res.status(500).send({
      status: 500,
      error: "Internal Server Error",
      details: { message: err.message },
    });
  }
});

// When receiving successful LTI launch redirects to app
lti.onConnect(async (token, req, res) => {
  debugger;
  res.cookie("ltik", res.locals.ltik, {
    secure: true,
    httpOnly: false,
    sameSite: "None",
  });
  return res.sendFile(path.join(__dirname, "./public/dlx-client/index.html"));
});

// When receiving deep linking request redirects to deep screen
lti.onDeepLinking(async (token, req, res) => {
  debugger;
  //fs.writeFile('~/DLX-Server/devopsdlxserver/OnDeepLink.txt', 'We in');
  return lti.redirect(res, "/deeplink", { newResource: true });
});

// Setting up routes
lti.app.use(routes);

// Setup function
const setup = async () => {
  await lti.deploy({ port: process.env.PORT });

//   /**
//    * Register platform
//    */
//   await lti.registerPlatform({
//     url: "https://vconestoga.duckdns.org",
//     name: "Moodle",
//     clientId: process.env.CLIENT_ID,
//     authenticationEndpoint: "https://vconestoga.duckdns.org/mod/lti/auth.php",
//     accesstokenEndpoint: "https://vconestoga.duckdns.org/mod/lti/token.php",
//     authConfig: {
//       method: "JWK_SET",
//       key: "https://vconestoga.duckdns.org/mod/lti/certs.php",
//     },
//   });

//   await lti.registerPlatform({
//     url: "https://conestoga.desire2learn.com",
//     name: "eConestoga",
//     clientId: "e69f1646-d2a0-4617-baeb-2f251c9c0ea4",
//     authenticationEndpoint:
//       "https://conestoga.desire2learn.com/d2l/lti/authenticate",
//     accesstokenEndpoint: "https://auth.brightspace.com/core/connect/token",
//     authConfig: {
//       method: "JWK_SET",
//       key: "https://conestoga.desire2learn.com/d2l/.well-known/jwks",
//     },
//   });
};

setup().then(logger.http(`Listening on port ${process.env.PORT}`));
