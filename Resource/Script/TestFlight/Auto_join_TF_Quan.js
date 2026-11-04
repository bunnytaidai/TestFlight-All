/*
Script Author: Hely-T
Upgraded: v4.6.0.0 (Quantumult X / Universal + Auto-seed Google Chrome beta LPQmtkUs + Multi-Account support)
Reference: https://github.com/bunnytaidai/TestFlight-All/
*/
const DEFAULT_CHROME_BETA_ID = "LPQmtkUs";

!(async () => {
  let ids = $prefs.valueForKey("APP_ID");
  if (ids === undefined || ids === null) {
    ids = DEFAULT_CHROME_BETA_ID;
    $prefs.setValueForKey(ids, "APP_ID");
  }
  if (ids == "") {
    $notify("Tất cả TestFlight đã được thêm vào", "Vui lòng tắt plugin theo cách thủ công", "");
    $done();
  } else {
    ids = ids.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      for await (const ID of ids) {
        await autoPost(ID);
      }
    } catch (error) {
      console.log(error);
      $done();
    }
  }
  $done();
})();

function autoPost(ID) {
  let Key = $prefs.valueForKey("key");
  let testurl = "https://testflight.apple.com/v3/accounts/" + Key + "/ru/";
  let header = {
    "X-Session-Id": `${$prefs.valueForKey("session_id")}`,
    "X-Session-Digest": `${$prefs.valueForKey("session_digest")}`,
    "X-Request-Id": `${$prefs.valueForKey("request_id")}`,
  };
  return new Promise(function (resolve) {
    $task.fetch({ url: testurl + ID, method: "GET", headers: header }).then(
      (resp) => {
        const { body: data } = resp;
        if (resp.status == 404 || resp.statusCode == 404) {
          let ids = ($prefs.valueForKey("APP_ID") || "").split(",");
          ids = ids.filter((item) => item !== ID);
          $prefs.setValueForKey(ids.toString(), "APP_ID");
          console.log(ID + " TestFlight không tồn tại, APP_ID đã tự động bị xóa");
          $notify(ID, "TestFlight không tồn tại", "APP_ID đã tự động bị xóa");
          resolve();
        } else {
          let jsonData;
          try {
            jsonData = JSON.parse(data);
          } catch (e) {
            resolve();
            return;
          }
          if (!jsonData || jsonData.data == null) {
            const msg = jsonData && jsonData.messages && jsonData.messages[0] ? jsonData.messages[0].message : "Chưa sẵn sàng";
            console.log(ID + " " + msg);
            resolve();
          } else if (jsonData.data.status == "FULL") {
            console.log(ID + " " + (jsonData.data.message || "Chế độ thử nghiệm đã đầy"));
            resolve();
          } else {
            $task.fetch({ url: testurl + ID + "/accept", method: "POST", headers: header }).then((res) => {
              const { body } = res;
              let jsonBody;
              try {
                jsonBody = JSON.parse(body);
              } catch (e) {
                resolve();
                return;
              }
              const appName = jsonBody && jsonBody.data && jsonBody.data.name ? jsonBody.data.name : ID;
              $notify(appName, "TestFlight đã tham gia thành công.", "");
              console.log(appName + " TestFlight đã tham gia thành công.");
              let ids = ($prefs.valueForKey("APP_ID") || "").split(",");
              ids = ids.filter((item) => item !== ID);
              $prefs.setValueForKey(ids.toString(), "APP_ID");
              resolve();
            });
          }
        }
      },
      (error) => {
        if (error == "The request timed out.") {
          resolve();
        } else {
          console.log(ID + " " + error);
          resolve();
        }
      }
    );
  });
}
