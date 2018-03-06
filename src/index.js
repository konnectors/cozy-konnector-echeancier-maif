// Force sentry DSN into environment variables
// In the future, will be set by the stack
process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  "https://1bdc9628c1724cb899ce99bb547efd19:6bd1ecd2e64e42558499c9b2a5d1a0e7@sentry.cozycloud.cc/17";

const pdfBillsHelper = require("./pdfBillsHelper.js");

const {
  BaseKonnector,
  saveBills,
  requestFactory,
  log
} = require("cozy-konnector-libs");

let request = requestFactory({
  cheerio: true,
  json: false,
  //debug: true,
  jar: true
});

const connector = new BaseKonnector(start);

function start(fields) {
  return connector
    .initSession(fields)
    .then(connector.logIn)
    .then(connector.getInfos)
    .then(connector.pdfToJson)
    .then(connector.extractBills)
    .then(data => connector.saveBills(data, fields));
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

    let form = {
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
      form[input.attr("name")] = input.attr("value");
    }

    return { connectUrl, form };
  });
};

connector.logIn = function(connectData) {
  log("info", "Logging in");
  log("secret", "Data : " + JSON.stringify(connectData));

  return request({
    url: connectData.connectUrl,
    method: "POST",
    form: connectData.form,
    resolveWithFullResponse: true
  }).then(response => {
    // Check connect ok
    log("info", "Logging status code : " + response.statusCode);
    return;
  });
};

connector.getInfos = function() {
  return request({
    url: "https://www.maif.fr/informationspersonnelles/accueilInfoPerso.action",
    resolveWithFullResponse: true
  }).then(response => {
    const accessToken = response.request.uri.hash.match(
      /#token=(.*)&refreshToken=/
    )[1];

    request = requestFactory({
      cheerio: false,
      json: true,
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    return Promise.all([
      request("https://espacepersonnel.maif.fr/societaire/api/societaire/me"),
      accessToken
    ]);
  });
};

connector.pdfToJson = function([infos, accessToken]) {
  const pdfUrl = `https://espacepersonnel.maif.fr${
    infos.avisEcheance.link
  }&token=${accessToken}`;
  return request({ url: pdfUrl, encoding: null }).then(data => {
    return { pdfUrl, data, infos };
  });
};

connector.extractBills = function({ pdfUrl, data, infos }) {
  return pdfBillsHelper.getBills(new Uint8Array(data)).then(extractedData => {
    return { pdfUrl, infos, extractedData };
  });
};

connector.saveBills = function({ pdfUrl, infos, extractedData }, fields) {
  log("info", "Creating Bills with !" + pdfUrl);
  const bills = [];

  for (var idx in extractedData) {
    bills.push({
      amount: extractedData[idx].amount,
      date: extractedData[idx].date.toDate(),
      fileurl: pdfUrl,
      filename: "Avis_echeance.pdf",
      slug: "maif",
      maifdateadhesion: infos.dateAdhesion,
      maiftelephone: "09 72 72 15 15",
      maifnumsocietaire: infos.numeroSocietaireFormate
    });
  }

  return saveBills(bills, fields, { identifiers: ["MAIF"] });
};

module.exports = connector;
