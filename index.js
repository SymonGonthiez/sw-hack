const http = require("http");
const url = require("url");
const net = require("net");
const os = require("os");
const {
  decrypt_request,
  decrypt_response,
  encrypt_request,
  decrypt_request_plain,
} = require("./sm_decryptor");

//SW BATTLE RESULT
const WIN = 1;
const LOSE = 2;
const SKIP = -1;

function getLocalIP() {
  var interfaces = os.networkInterfaces();
  for (var k in interfaces) {
    for (var k2 in interfaces[k]) {
      var address = interfaces[k][k2];
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }
}

const PORT = 8080;
const localip = getLocalIP();
//log serverResponse/clientRequest | fakeRequest = true -> hack disabled only log edited result , if false, enable hack
const debug = { serverResponse: true, clientRequest: true, fakeRequest: true };

console.log(`Proxy running: ${localip}:${PORT}`);

function summonerWarsDataParser(encData) {
  try {
    let plainData = decrypt_request_plain(encData);
    let jsonData = JSON.parse(plainData);
    let { command } = jsonData;
    let result;
    if (
      command === "BattleScenarioResult" ||
      command === "BattleArenaResult" ||
      command === "BattleDungeonResult" ||
      command === "BattleTrialTowerResult_v2" ||
      command === "BattleGuildSiegeResult"
    ) {
      let { win_lose } = jsonData;
      result = win_lose;
    }
    //if we already win or command isn't from scenario, no need to change just skip editing packet
    if (result === undefined || result === WIN) {
      result = SKIP;
    }
    return { plainData, result };
  } catch (e) {
    console.log("Failed parsing data from client");
    console.log(e);
    return { plainData: null, SKIP, error: true };
  }
}
//replace data in string to create a win request, i don't edit json object because the response has some JSON indent
//i'm too lazy to find out -> so that editedRequest/originalRequest length is the same
function summonerWarsAlwaysWin(reqPlain) {
  var regResult = /(result.*)(\d)/g;
  var reg2 = /(.*?(?:opp_unit_status_list).*?\[[^\]]*.)/;
  var regwin = /(win_lose.*)(\d)/g;
  var value = WIN;
  reqPlain = reqPlain.replace(regwin, "$11");
  reqPlain = reqPlain.replace(
    reg2,
    reqPlain.match(reg2)[0].replace(regResult, `$1${value}`)
  );
  return reqPlain;
}

function encryptData(editData) {
  try {
    let encOut = encrypt_request(editData);
    let buffer = Buffer.from(encOut);
    return { buffer };
  } catch (e) {
    console.log("error encrypting data");
    return { error: true };
  }
}

function parseServerResponse(encData) {
  try {
    JSONresponse = decrypt_response(encData);
    console.log("---------Server response-----------");
    console.log(JSONresponse);
    console.log("---------End Server response---------");
  } catch (e) {
    console.log("Failed decrypting response from server");
    console.log(e);
  }
}

function parseClientRequest(encData) {
  try {
    JSONrequest = decrypt_request(encData);
    console.log("---------Client request-----------");
    console.log(JSONrequest);
    console.log("---------End Client request---------");
  } catch (e) {
    console.log("Failed decrypting request from client");
    console.log(e);
  }
}

let httpServer = http
  .createServer(function (request, response) {
    let parsedURL = url.parse(request.url);
    let chunks = [];
    let responseChunks = [];
    //client request (client -> proxy)
    request.on("data", (chunk) => {
      chunks.push(chunk);
    });

    request.on("end", () => {
      let data = chunks.join("");
      //EDIT CHUNKS HERE
      // SW API
      if (request.url.indexOf("qpyou.cn/api/gateway_c2.php") >= 0) {
        if (debug.clientRequest) {
          parseClientRequest(data);
        }

        let { plainData, result, error } = summonerWarsDataParser(data);

        if (!error) {
          if (result !== SKIP) {
            let editedDataPlain = summonerWarsAlwaysWin(plainData);
            let { buffer, error } = encryptData(editedDataPlain);
            if (!error) {
              if (buffer.length !== data.length) {
                //you can also edit request length using request.headers["content-length"] = yourLength
                // i  would not recommend that because who knows if anti hacks check that too...
                console.log(
                  "Something went wrong, request length != edited request length"
                );
              } else {
                //prevent editing data, only log fake request
                if (debug.fakeRequest) {
                  console.log("----------Edited data--------------");
                  console.log(editedDataPlain);
                  console.log("----------End Edited data----------");
                } else {
                  data = buffer;
                }
              }
            }
          }
        }
      }
      //------------------------------

      //proxy request (client -> proxy -> server)
      let proxy_req = http.request({
        method: request.method,
        hostname: parsedURL.hostname,
        headers: request.headers,
        path: parsedURL.path,
      });
      //TODO: error handler
      proxy_req.on("error", function (err) {});

      //proxy server response to client (server -> proxy -> client)
      proxy_req.on("response", function (proxy_response) {
        proxy_response.on("data", function (chunk) {
          responseChunks.push(chunk);
          response.write(chunk, "binary");
        });
        proxy_response.on("end", function () {
          response.end();
          if (debug.serverResponse) {
            if (request.url.indexOf("qpyou.cn/api/gateway_c2.php") >= 0)
              parseServerResponse(responseChunks.join(""));
          }
          //clear response
          responseChunks = [];
        });
        response.writeHead(proxy_response.statusCode, proxy_response.headers);
      });
      //write response data
      proxy_req.write(data);
      proxy_req.end();
    });
  })
  .listen(PORT, "0.0.0.0");

//https requests -> pipe them to prevent proxy blocking ssl requests
httpServer.on("connect", function (req, socket) {
  if (req.url.split(":")[1] === "443") {
    const serverUrl = url.parse(`https://${req.url}`);
    const serverSocket = net.connect(serverUrl.port, serverUrl.hostname, () => {
      socket.write(
        "HTTP/1.1 200 Connection Established\r\n" +
          "Proxy-agent: winProxy\r\n" +
          "\r\n"
      );
      serverSocket.pipe(socket);
      socket.pipe(serverSocket);
    });

    serverSocket.on("error", () => {});
    socket.on("error", () => {});
  }
});
