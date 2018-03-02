// Force sentry DSN into environment variables
// In the future, will be set by the stack
process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  "https://1bdc9628c1724cb899ce99bb547efd19:6bd1ecd2e64e42558499c9b2a5d1a0e7@sentry.cozycloud.cc/17";

const PDFParser = require("pdf2json");
const pdfBillsHelper = require("./pdfBillsHelper.js");

const { BaseKonnector, requestFactory, log } = require("cozy-konnector-libs");

let request = requestFactory({
  cheerio: true,
  json: false,
  // debug: true,
  jar: true
});

const connector = new BaseKonnector(start);

function start(fields) {
  return connector
    .initSession(fields)
    .then(connectData => connector.logIn(connectData))
    .then(connector.getTimetablePdfUrl)
    .then(pdfURL => connector.pdfToJson(pdfURL))
    .then(json => connector.extractBills(json))
    .then(bills => connector.createBills(bills));
}

connector.initSession = function(fields) {
  log("info", "Init session");
  const baseUrl = "https://connect.maif.fr";
  return request({
    url: baseUrl + "/connect/s/popup/identification",
    method: "GET",
    resolveWithFullResponse: true
  }).then(response => {
    const $ = response.body;

    let formData = {
      j_username: fields.login,
      j_password: fields.password
    };

    const connectUrl =
      baseUrl + $("form[id='j_spring_security_check']").attr("action");
    const inputs = Array.from(
      $("form[id='j_spring_security_check']").find("input[type='hidden']")
    );
    for (var i in inputs) {
      const input = $(inputs[i]);
      formData[input.attr("name")] = input.attr("value");
    }

    formData["struts.token.name"] = "j_spring_security_checktoken";

    return { connectUrl, formData };
  });
};

connector.logIn = function(connectData) {
  log("info", "Logging in");
  log("info", "Data : " + JSON.stringify(connectData));

  return request({
    url: connectData.connectUrl,
    method: "POST",
    formData: connectData.formData,
    resolveWithFullResponse: true
  }).then(response => {
    log("info", "Logging status code : " + response.statusCode);
    log("info", "Page url : " + response.request.uri.pathname);

    // Check connect ok
    return;
  });
};

connector.getTimetablePdfUrl = function() {
  log("info", "Getting PDF Timetable url");
  return request({
    url: "https://espacepersonnel.maif.fr/avis-echeance",
    method: "GET",
    resolveWithFullResponse: true
  }).then(response => {
    const $ = response.body;

    log("info", "Page with PDF link status code : " + response.statusCode);
    log("info", "Page url : " + response.request.uri.pathname);

    const pdfUrl = $("button[id='download-documentation']").attr("href");
    return pdfUrl
      ? pdfUrl
      : "http://espacepersonnel.maif.fr/avisecheance/api/avis-echeance?dateAdhesion=2012-11-14&token=eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIxLThPNy0yMzIyOSIsImF1dGgiOiIxLDgsMTAiLCJuYW1lIjoiMzcxMjU2NHAiLCJmaXJzdG5hbWUiOiJGcmFuY29pcyIsImxhc3RuYW1lIjoiREVTTUlFUiIsImVtYWlsIjoiZmRlc21pZXJAZ21haWwuY29tIiwiaWQiOiIxLThPNy0yMzIyOSIsIm51bXNvYyI6IjM3MTI1NjRwIiwiZXhwIjoxNTIwMDY3NDIwfQ.f30m1LrtGloS8v55sVTu-AiFcl4-gqPdrUxT02GsYihqli6xpJM4tOQSNEzOqpzY-5ltbLXDxCeUOynG1jtIYA";
  });
};

connector.pdfToJson = function(pdfUrl) {
  return new Promise(function(resolve) {
    log("info", "Parsing PDF from : " + pdfUrl);

    let pdfParser = new PDFParser();
    request({ url: pdfUrl, encoding: null }).pipe(pdfParser);

    pdfParser.on("pdfParser_dataError", errData => {
      log("error", "PDFParser error : " + errData.parserError);
    });

    pdfParser.on("pdfParser_dataReady", pdfData => {
      resolve(pdfData);
    });
  });
};

connector.extractBills = function(json) {
  return new Promise(function(resolve) {
    log("info", "Extracting Bills !");

    const bills = pdfBillsHelper.getBills(json);

    log("info", "Extracting Bills Finished ! " + bills.length + " found !");

    resolve(bills);
  });
};

connector.createBills = function(bills) {
  for (var idx in bills) {
    log(
      "info",
      "Bill to create : " +
        bills[idx].date.format("YYYY-MM-DD") +
        " --> " +
        bills[idx].amount
    );
  }
};

module.exports = connector;
