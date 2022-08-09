module.exports.getDate = function () {
  let today = new Date();

  let options = {
    weekday: "long",
    day: "numeric",
    month: "long",
  };
  return (day = today.toLocaleDateString("en-us", options));
};
