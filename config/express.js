var env = process.env.NODE_ENV = process.env.NODE_ENV || 'development',
  config = require('./config'),
  logger = require('winston'),
  express = require('express'),
  params = require('express-params'),
  redisClient = require('./redis'),
  redisStore = require('connect-redis')(express),
  flash = require('connect-flash'),
  expressWinston = require('express-winston'),
  userUtil = require('../www/utils/user');

module.exports = function (app, passport) {

  params.extend(app);

  app.set('port', config.get('port'));
  app.set('views', [config.get('root'), 'www', 'views'].join('/'));
  app.set('view engine', 'ejs');

  // HTML using ejs is used with server auth protected angularjs templates
  // Eg. Only logged in uses can load the create template
  app.engine('html', require('ejs').renderFile);

  app.disable('x-powered-by');

  //app.use(express.favicon());

  app.use(express.json());
  app.use(express.urlencoded());

  app.use(express.methodOverride());

  app.use(express.cookieParser());

  // Session storage
  app.use(express.session({
    key: config.get('cookieKey'),
    secret: config.get('cookieSecret'),
    cookie: {
      domain: config.get('app').cookieDomain,
      expires: new Date(config.get('cookieExpire'))
    },
    store: new redisStore({
      secret: config.get('redisSessionSecret'),
      client: redisClient
    })
  }));

  // connect flash for passportjs flash messages
  app.use(flash());

  // use passport session
  app.use(passport.initialize());
  app.use(passport.session());


  app.use(express.csrf());

  // Angular’s $http library reads the token from the XSRF-TOKEN cookie.
  // We therefore have to set this cookie and send it to the client.
  // Setting a cookie in Express is done via the res.cookie('name', 'value') function.
  // The name is obviously XSRF-TOKEN. The value is read from the user’s session.
  // The key req.session._csrf is automatically generated by the csrf middleware.
  app.use(function (req, res, next) {
    res.cookie('XSRF-TOKEN', req.csrfToken());
    next();
  });

  app.use(app.router);

  // static files are handled by NGINX in production
  app.use(express.static([config.get('root'), 'app'].join('/')));

  // Logging

  // HTTP log
  // express-winston logger makes sense BEFORE the router.
  app.use(expressWinston.logger({
    transports: [
      new (logger.transports.File)({
        filename: config.get('root') + '/log/' + env + '_access.log',
        maxsize: config.get('logMaxFileSize'),
        maxfiles: config.get('logMaxFiles')
      })
    ]
  }));

  // Error log
  // express-winston errorLogger makes sense AFTER the router.
  app.use(expressWinston.errorLogger({
    transports: [
      new (logger.transports.File)({
        filename: config.get('root') + '/log/' + env + '_error.log',
        maxsize: config.get('logMaxFileSize'),
        maxfiles: config.get('logMaxFiles')
      })
    ]
  }));

  // Error Response Pages
  // Assume "not found" in the error msgs is a 404. this is somewhat silly, but valid, you can do whatever you like, set properties, use instanceof etc.
  app.use(function (err, req, res, next) {

    //Treat as 404
    if (~err.message.indexOf('not found')) {
      return next();
    }

    // If 403 send JSON reponse
    if (err.status === +403) {
      res.jsonp(403, {error: 'Forbidden'});
    }
    else {
      // All else defaults to HTML error page
      var user = userUtil.user(req);

      // System error message to display
      var errorMsg;

      if ('development' === app.get('env')) {
        errorMsg = err.stack;
      }
      else {
        errorMsg = 'We\'re sorry, but something went wrong. We\'ve been notified about this issue and we\'ll take a look at it shortly.';
      }

      res.status(500).render('500.html', {
        title: config.get('app').name,
        hostname: req.host,
        user: JSON.stringify(user),
        error: errorMsg
      });
    }

  });

  // Assume 404 since no middleware responded
  app.use(function (req, res) {

    // AngularJS handle 404 page
    res.redirect('/#/' + req.originalUrl);
  });

};
