const moment = require("moment");

function sortNumber(a, b) {
  return a - b;
}

function sortBoxesNaturalReadingOrder(a, b) {
  const ay = (a.top + a.bottom) / 2;
  const by = (b.top + b.bottom) / 2;
  const ax = (a.left + a.right) / 2;
  const bx = (b.left + b.right) / 2;

  return ay == by ? ax - bx : ay - by;
}

function isInTheBox(box, x, y) {
  return y >= box.top && y <= box.bottom && x >= box.left && x <= box.right;
}

function getFollowingDataBoxes(x, y, horizontals, verticals) {
  const { top, bottom } = getSeparatorLines(horizontals, y);

  let xvalues = [];

  for (var i in verticals) {
    const vertical = verticals[i];

    const y1 = vertical.y;
    const y2 = vertical.y + vertical.l;
    const middle = (top + bottom) / 2;

    if (vertical.x > x && (middle >= y1 && middle <= y2)) {
      xvalues.push(vertical.x);
    }
  }
  xvalues.sort(sortNumber);

  let boxes = [];
  let left;
  for (i in xvalues) {
    const right = xvalues[i];
    if (left) {
      const box = { top, bottom, left, right };
      boxes.push(box);
    }
    left = right;
  }

  return boxes;
}

function getSeparatorLines(lines, y) {
  let top = -Infinity;
  let bottom = Infinity;

  for (var i in lines) {
    const line = lines[i];

    if (line.y > top && line.y < y) {
      top = line.y;
    }
    if (line.y < bottom && line.y > y) {
      bottom = line.y;
    }
  }

  return { top, bottom };
}

function decode(input) {
  return input
    .replace(/%20/g, " ")
    .replace(/%C3%A9/g, "é")
    .replace(/%C3%BB/g, "û")
    .replace(/%2C/g, ".");
}

exports.getBills = function(json) {
  const hlines = json.formImage.Pages[0].HLines;
  const vlines = json.formImage.Pages[0].VLines;
  const texts = json.formImage.Pages[0].Texts;

  let dateBoxes = [];
  let amountBoxes = [];
  let telephone, numsocietaire;

  for (var t in texts) {
    const text = texts[t];
    const x = text.x;
    const y = text.y;

    const telephoneprefix = "T%C3%A9l%C3%A9phone%20%3A%20";
    const numsocietaireprefix = "N%C2%B0%20de%20soci%C3%A9taire%20%3A%20";
    if (text.R[0].T.startsWith(telephoneprefix)) {
      telephone = decode(text.R[0].T.substring(telephoneprefix.length));
    } else if (text.R[0].T.startsWith(numsocietaireprefix)) {
      numsocietaire = decode(text.R[0].T.substring(numsocietaireprefix.length));
    } else if (text.R[0].T === "Date%20de%20pr%C3%A9l%C3%A8vement") {
      dateBoxes = dateBoxes.concat(getFollowingDataBoxes(x, y, hlines, vlines));
    } else if (text.R[0].T === "Montant%20en%20euros") {
      amountBoxes = amountBoxes.concat(
        getFollowingDataBoxes(x, y, hlines, vlines)
      );
    }
  }

  dateBoxes.sort(sortBoxesNaturalReadingOrder);
  amountBoxes.sort(sortBoxesNaturalReadingOrder);

  const bills = [];
  for (var idx = 0; idx < dateBoxes.length; idx++) {
    let dateStr = "";
    let amountStr = "";
    for (var i in texts) {
      const text = texts[i];
      if (isInTheBox(dateBoxes[idx], text.x, text.y)) {
        dateStr += text.R[0].T + " ";
      }
      if (isInTheBox(amountBoxes[idx], text.x, text.y)) {
        amountStr += text.R[0].T + " ";
      }
    }

    const date = moment(decode(dateStr), "D MMMM YYYY", "fr");
    const amount = parseFloat(decode(amountStr));

    const bill = {
      date,
      amount,
      telephone,
      numsocietaire
    };
    bills.push(bill);
  }

  return bills;
};
