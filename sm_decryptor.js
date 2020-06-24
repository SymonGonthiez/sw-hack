const crypto = require("crypto");
const zlib = require("zlib");
const fs = require("fs");

const encryptkey = function decrypt(text) {
  //OOPPS, bon courage !
  const key = encryptkey;
  const algorithm = "aes-128-cbc";

  let decipher = crypto.createDecipheriv(
    algorithm,
    key,
    "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
  );
  let dec = decipher.update(text, "base64", "latin1");
  dec += decipher.final("latin1");

  return dec;
};

function encrypt(text) {
  const key = encryptkey;
  const algorithm = "aes-128-cbc";
  let cypher = crypto.createCipheriv(
    algorithm,
    key,
    "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
  );
  let enc = cypher.update(text, "latin1", "base64");
  enc += cypher.final("base64");
  return enc;
}

module.exports = {
  decrypt_request: (text) => JSON.parse(decrypt(text)),
  decrypt_request_plain: (text) => decrypt(text),
  decrypt_response: (text) =>
    JSON.parse(zlib.inflateSync(Buffer.from(decrypt(text), "latin1"))),
  encrypt_request: (text) => encrypt(text),
};
