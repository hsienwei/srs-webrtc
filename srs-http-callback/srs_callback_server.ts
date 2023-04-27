import express from "express"

const app = express();
const port = 3000

app.use(express.json())

app.get("/", (req, resp, next) => {
    resp.send("Hello");
})

app.all("/api/v1/streams", (req, resp) => {
    console.log("================================================");
    console.log(req.headers);
    console.log(req.body);

    if(req.body.action !== "on_publish")
    {
        resp.status(200).send({"code": 0});
        return;
    }

    const params = new URLSearchParams(req.body.param)
    const token: string = params.get("token") ?? "";
    if(token === "aabbcc")
        resp.status(200).send({"code": 0});
    else
        resp.sendStatus(403);
})


app.listen(port, () => {
    console.log(`app listening on port ${port}`)
})
