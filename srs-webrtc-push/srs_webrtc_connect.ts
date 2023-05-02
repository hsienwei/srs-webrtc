
function parse(url: string) {
    // @see: http://stackoverflow.com/questions/10469575/how-to-use-location-object-to-parse-url-without-redirecting-the-page-in-javascri
    var a = document.createElement("a");
    a.href = url.replace("rtmp://", "http://")
        .replace("webrtc://", "http://")
        .replace("rtc://", "http://");

    var vhost = a.hostname;
    var app = a.pathname.substring(1, a.pathname.lastIndexOf("/"));
    var stream = a.pathname.slice(a.pathname.lastIndexOf("/") + 1);

    // parse the vhost in the params of app, that srs supports.
    app = app.replace("...vhost...", "?vhost=");
    if (app.indexOf("?") >= 0) {
        var params = app.slice(app.indexOf("?"));
        app = app.slice(0, app.indexOf("?"));

        if (params.indexOf("vhost=") > 0) {
            vhost = params.slice(params.indexOf("vhost=") + "vhost=".length);
            if (vhost.indexOf("&") > 0) {
                vhost = vhost.slice(0, vhost.indexOf("&"));
            }
        }
    }

    // when vhost equals to server, and server is ip,
    // the vhost is __defaultVhost__
    if (a.hostname === vhost) {
        var re = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;
        if (re.test(a.hostname)) {
            vhost = "__defaultVhost__";
        }
    }

    // parse the schema
    var schema = "rtmp";
    if (url.indexOf("://") > 0) {
        schema = url.slice(0, url.indexOf("://"));
    }

    var port: string = a.port;
    if (!port) {
        // Finger out by webrtc url, if contains http or https port, to overwrite default 1985.
        if (schema === 'webrtc' && url.indexOf(`webrtc://${a.host}:`) === 0) {
            port = (url.indexOf(`webrtc://${a.host}:80`) === 0) ? "80" : "443";
        }

        // Guess by schema.
        if (schema === 'http') {
            port = "80";
        } else if (schema === 'https') {
            port = "443";
        } else if (schema === 'rtmp') {
            port = "1935";
        }
    }

    var ret: any = {
        url: url,
        schema: schema,
        server: a.hostname, port: port,
        vhost: vhost, app: app, stream: stream
    };
    fill_query(a.search, ret);

    // For webrtc API, we use 443 if page is https, or schema specified it.
    if (!ret.port) {
        if (schema === 'webrtc' || schema === 'rtc') {
            if (ret.user_query.schema === 'https') {
                ret.port = "443";
            } else if (window.location.href.indexOf('https://') === 0) {
                ret.port = "443";
            } else {
                // For WebRTC, SRS use 1985 as default API port.
                ret.port = "1985";
            }
        }
    }

    return ret;
}

function fill_query(query_string: string, obj: any) {
    // pure user query object.
    obj.user_query = {};

    if (query_string.length === 0) {
        return;
    }

    // split again for angularjs.
    if (query_string.indexOf("?") >= 0) {
        query_string = query_string.split("?")[1];
    }

    var queries = query_string.split("&");
    for (var i = 0; i < queries.length; i++) {
        var elem = queries[i];

        var query = elem.split("=");
        obj[query[0]] = query[1];
        obj.user_query[query[0]] = query[1];
    }

    // alias domain for vhost.
    if (obj.domain) {
        obj.vhost = obj.domain;
    }
}

function prepareUrl(url: string) {
    var urlObject= parse(url);

    // If user specifies the schema, use it as API schema.
    var schema = urlObject.user_query.schema;
    schema = schema ? schema + ':' : window.location.protocol;

    var port = urlObject.port || 1985;
    if (schema === 'https:') {
        port = urlObject.port || 443;
    }

    // @see https://github.com/rtcdn/rtcdn-draft
    var api = urlObject.user_query.play || '/rtc/v1/publish/' //self.__internal.defaultPath;
    if (api.lastIndexOf('/') !== api.length - 1) {
        api += '/';
    }

    var apiUrl = schema + '//' + urlObject.server + ':' + port + api;
    for (var key in urlObject.user_query) {
        if (key !== 'api' && key !== 'play') {
            apiUrl += '&' + key + '=' + urlObject.user_query[key];
        }
    }
    // Replace /rtc/v1/play/&k=v to /rtc/v1/play/?k=v
    apiUrl = apiUrl.replace(api + '&', api + '?');

    var streamUrl = urlObject.url;

    return {
        apiUrl: apiUrl, streamUrl: streamUrl, schema: schema, urlObject: urlObject, port: port,
        tid: (new Date().getTime()*Math.random()*100).toString(16).slice(0, 7)
    };
}

async function getSrsAnwser(offer: RTCSessionDescriptionInit, url: string ): Promise<string> {
    const conf: any = prepareUrl(url);
    console.log(conf);
    return new Promise(function (resolve, reject) {
            
        var data = {
            api: conf.apiUrl, 
            tid: conf.tid, 
            streamurl: conf.streamUrl,
            clientip: null, 
            sdp: offer.sdp
        };

        console.log("Generated offer: ", offer);
        console.log("apiUrl: ", conf.apiUrl);
        
        const xhr = new XMLHttpRequest();
        xhr.onload = function() {
            if (xhr.readyState !== xhr.DONE) return;
            if (xhr.status !== 200 && xhr.status !== 201) return reject("status not success");
            const data = JSON.parse(xhr.responseText);
            console.log("Got answer: ", data);
            return data.code ? reject("code not exist") : resolve(data);
        }
        xhr.open('POST', conf.apiUrl, true);
        xhr.setRequestHeader('Content-type', 'application/sdp');
        xhr.send(
                JSON.stringify(data)
        );
    });

}

async function onConnect() {
    const pc = new RTCPeerConnection();

    pc.addTransceiver("audio", { direction: "sendonly" });
    pc.addTransceiver("video", { direction: "sendonly" });

    var stream = await navigator.mediaDevices.getUserMedia(
        {
            audio: true,
            video: {
                width: { ideal: 320, max: 576 }
            }
        }
    );

    stream.getTracks().forEach(function (track) {
        pc.addTrack(track);
    });


    var offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const url: string = (document.getElementById("url") as HTMLInputElement).value;
    const token: string = (document.getElementById("token") as HTMLInputElement).value;

    const result: HTMLDivElement = document.getElementById("result") as HTMLDivElement;

    try {
        const answer: any = await getSrsAnwser(offer, `${url}?token=${token}`);
        if (answer.code === 0) {
            await pc.setRemoteDescription(
                new RTCSessionDescription({ type: 'answer', sdp: answer.sdp })
            );
        }
        else {
            console.log(answer.code)
        }
        result.innerText = JSON.stringify(answer);
    }
    catch (e: any) {
        result.innerText = e.toString();
    }
}


function main()
{
    (document.getElementById("connect") as HTMLButtonElement).onclick = onConnect;
}

main();



