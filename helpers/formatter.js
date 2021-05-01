const phoneNumberFormatter = function (number) {
  // 1.Menghilangkan karakter selain angka
  let formatted = number.replace(/\D/g, "");
  //   2.Menghilangkan 0 didepan (prefix) kemudian di ganti menjadi 62
  if (formatted.startsWith("0")) {
    formatted = "62" + formatted.substr(1);
  }

  if (!formatted.endsWith("@c.us ")) {
    formatted += "@c.us";
  }

  return formatted;
};

module.exports = {
  phoneNumberFormatter,
};
