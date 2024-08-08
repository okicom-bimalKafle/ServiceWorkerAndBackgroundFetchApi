self.addEventListener("install", (event) => {
  event.waitUntil(console.log("Service worker installing"));
});
self.addEventListener("activate", (event) => {
  event.waitUntil("Service Worker activating.");
});

self.addEventListener("backgroundfetchsuccess", (event) => {
  event.waitUntil(
    (async function () {
      const bgFetch = event.registration;
      const records = await bgFetch.matchAll();
      console.log("Fetched records:", records);

      const cache = await caches.open("my-cache");
      let successful = true;

      for (const record of records) {
        try {
          console.log("Record", record);
          const response = await record.responseReady;
          console.log("Response", response);
          const method = record.request.method;
          console.log("method type", method);
          if (method === "PUT") {
            console.log("Processing upload...");
            // Handle upload-specific logic
          } else if (method === "GET") {
            console.log("Processing download...");
            if (response.ok) {
              await cache.put(record.request.url, response.clone());
            } else {
              successful = false;
            }
          }
        } catch (error) {
          console.error("Error processing record:", error);
          successful = false;
        }
      }

      if (successful) {
        console.log("Background Fetch succeeded");
      } else {
        console.log("Background Fetch failed");
      }

      const clients = await self.clients.matchAll();
      clients.forEach((client) => {
        client.postMessage({ message: "Background fetch succeeded" });
      });
    })()
  );
});

self.addEventListener("backgroundfetchfail", (event) => {
  console.log("Background Fetch failed:", event);
  console.log("Background Fetch failed:", event.registration);
});

self.addEventListener("backgroundfetchabort", (event) => {
  console.log("Background Fetch aborted:", event.registration);
});

self.addEventListener("backgroundfetchclick", (event) => {
  clients.openWindow("/");
});

self.addEventListener("message", async (event) => {
  console.log("Message received from main script", event);
  if (event.data && event.data.type === "UPLOAD_FILE") {
    const { file, presignedUrl } = event.data;
    console.log("data:", file, presignedUrl);
    console.time("uploadResponse");
    const formData = new FormData();
    for (const key in file) {
      formData.append(key, file[key]);
    }
    const startTime = performance.now();
    try {
      const uploadResponse = await fetch(presignedUrl, {
        method: "POST",
        body: formData,
      });
      const endTime = performance.now();
      const uploadTime = endTime - startTime;
      console.log("times:", startTime, endTime, uploadTime);
      if (uploadResponse.ok) {
        event.ports[0].postMessage({
          status: "success",
          location: presignedUrl.split("?")[0],
          uploadTime,
        });
      } else {
        event.ports[0].postMessage({
          status: "error",
          error: "Failed to upload file",
        });
      }
      console.timeEnd("uploadResponse");
    } catch (error) {
      console.log("error message is:", error);
      event.ports[0].postMessage({ status: "error", error: error.message });
    }
  }
});
