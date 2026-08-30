import serverless from "serverless-http";

let cachedHandler;

export const handler = async (event, context) => {
    if (!cachedHandler) {
        const { app } = await import("../../server/index.js");
        cachedHandler = serverless(app, {
            basePath: "/.netlify/functions/server"
        });
    }

    return cachedHandler(event, context);
};
