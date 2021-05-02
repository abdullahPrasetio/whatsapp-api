const mysql = require("mysql2/promise");

const createConnection = async () => {
  return await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "boelack413",
    database: "wa_api",
  });
};

const getReply = async (keyword) => {
  const connection = await createConnection();
  const [rows] = await connection.execute(
    `select message from wa_replies where keyword LIKE "%${keyword}%"`
  );
  if (rows.length > 0) return rows[0].message;
  return false;
};

module.exports = {
  createConnection,
  getReply,
};
