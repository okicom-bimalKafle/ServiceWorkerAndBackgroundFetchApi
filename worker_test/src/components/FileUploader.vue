<template>
  <div>
    <input type="file" @change="handleFileChange" />
    <button @click="uploadFile" :disabled="!selectedFile">Upload</button>
    <!-- <button @click="downloadFile">Download</button> -->
    <p>{{ message }}</p>
    <p>Test</p>
    <p v-if="timeInterval">Time taken to upload:{{ timeInterval }} seconds</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

const s3Config = {
  accessKeyId: import.meta.env.VITE_APP_ACCESS_KEY,
  secretAccessKey: import.meta.env.VITE_APP_SECRET_ACCESS_KEY,
  region: import.meta.env.VITE_APP_REGION,
  bucketName: import.meta.env.VITE_APP_BUCKET,
};

const selectedFile = ref(null);
const message = ref("");
const startTime = ref();
const endTime = ref();
const timeInterval = ref(0);

const handleFileChange = (event) => {
  selectedFile.value = event.target.files[0];
};

const uploadFile = async () => {
  if (!selectedFile.value) {
    message.value = "No file selected";
    return;
  }
  const formData = new FormData();
  const s3Client = new S3Client({
    region: s3Config.region,
    credentials: {
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey,
    },
  });
  const { url, fields } = await createPresignedPost(s3Client, {
    Bucket: s3Config.bucketName,
    Key: selectedFile.value.name,
  });
  console.log("presigned:", url, fields);
  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, value);
  });
  formData.append("file", selectedFile.value);
  message.value = "Uploading...";

  //for service worker call this function to upload the file
  // await uploadUsingServiceWorker(url, formData);

  //for normal fetch operation call this function
  // await normalFetch(url, formData);

  //for backgraound fetch api use this function
  await uploadUsingBackgroundFetchAPI(url, formData);
};

const uploadUsingServiceWorker = async (url, formData) => {
  try {
    if (navigator.serviceWorker.controller) {
      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = (event) => {
        if (event.data.status === "success") {
          console.log("here I am", event.data.uploadTime);
          timeInterval.value = event.data.uploadTime / 1000;
          message.value = `File uploaded successfully: ${event.data.location}`;
        } else {
          message.value = `Error uploading file: ${event.data.error}`;
        }
        selectedFile.value = null; // Reset the selected file
      };

      const serializedFormData = serializeFormData(formData);
      navigator.serviceWorker.controller.postMessage(
        {
          type: "UPLOAD_FILE",
          file: serializedFormData,
          presignedUrl: url,
        },
        [messageChannel.port2]
      );
    } else {
      message.value = "Service worker not ready";
    }
  } catch (error) {
    message.value = `Error generating presigned URL: ${error.message}`;
  }
};

// Function to serialize FormData into a plain object
const serializeFormData = (formData) => {
  const object = {};
  formData.forEach((value, key) => {
    object[key] = value;
  });
  return object;
};

const normalFetch = async (url, formData) => {
  try {
    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });
    if (response.ok) {
      message.value = `File uploaded successfully`;
    }
    console.log("Response", response);
  } catch (error) {
    console.error("Error", error);
    message.value = `File upload failed:${error}`;
  }
};

const uploadUsingBackgroundFetchAPI = async (url, formData) => {
  try {
    let intervalId = null;
    let counter = 0;
    const request = new Request(url, {
      method: "POST",
      body: formData,
    });

    const reg = await navigator.serviceWorker.ready;
    console.log("Reg", reg);

    const startTime = Date.now();
    console.log("Start time", startTime);

    const bgFetchReg = await reg.backgroundFetch.fetch("my-upload", request, {
      uploadTotal: formData.size,
      downloadTotal: 0,
      title: "Uploading file",
      icons: [{ src: "./movie.png", sizes: "192x192", type: "image/png" }],
    });

    intervalId = setInterval(() => {
      counter++;
      console.log(`Time elapsed: ${counter} seconds`);
    }, 1000);

    bgFetchReg.addEventListener("progress", () => {
      console.log("Upload progressing");
      const uploaded = bgFetchReg.uploaded;
      const uploadedMB = uploaded / (1024 * 1024);
      console.log(`Uploaded size: ${uploadedMB.toFixed(2)} MB`);

      const uploadTotal = bgFetchReg.uploadTotal;
      const uploadTotalMB = uploadTotal / (1024 * 1024);
      console.log(`Total size to upload: ${uploadTotalMB.toFixed(2)} MB`);

      const progress = (uploaded / uploadTotal) * 100;
      console.log(`Upload progress: ${progress.toFixed(2)}%`);

      if (progress.toFixed(2) >= 100) {
        clearInterval(intervalId);
        intervalId = null;
      }
    });

    bgFetchReg.addEventListener("backgroundfetchfail", (event) => {
      console.error("Background fetch failed:", event.registration);
      console.error("Failure reason:", event.registration.failureReason);
    });

    bgFetchReg.addEventListener("backgroundfetchabort", () => {
      console.error("Upload aborted");
    });
  } catch (error) {
    console.error("Error uploading file:", error);
  }
};

onMounted(() => {
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      console.log("Message received from service worker");
      if (event.data.message === "Background fetch succeeded") {
        // Fetch the cached file and display it
        message.value = "File Operation Completed";
        endTime.value = Date.now(); // Record end time
        const timeTaken = (endTime.value - startTime.value) / 1000; // Calculate time taken in seconds
        console.log(`Upload Time Taken ${timeTaken} seconds`);
      }
    });
  }
});
</script>
