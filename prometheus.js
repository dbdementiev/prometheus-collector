let http = require("http");

function Prometheus() {
    this.DefaultDataCollectionIntervalSec = 20 * 1000;
    this.dataCollectIntervalSec = this.DefaultDataCollectionIntervalSec;
    this.dataCollectInterval = null;
    this.collectors = new Map();
}

// ------------------------------------------------
// private functions
function ketMapKeys(keysIt) {
    let keys = [];
    for (const elem of keysIt) { keys.push(elem); }
    return keys;
}

// ------------------------------------------------
// PRIVATE class
const MaxErrorCounter = 5;

function PrometheusDataCollector(server, onServerDelete) {
    this.server = server;
    this.onServerDelete = onServerDelete;
    const srvParts = server.split(":");
    this.data = "";
    this.options = {
        host: srvParts[0],
        port: (srvParts.length > 1 ? parseInt(srvParts[1]) : 80),
        path: "/metrics"
    };
    this.errorCounter = 0;
}

PrometheusDataCollector.prototype.getData = function() {
    console.log(`>> Server ${this.server} returns ${this.data.length} bytes of data`);
    return this.data;
}

PrometheusDataCollector.prototype.setData = function(data) {
    this.data = data;
    console.log(`<< Server ${this.server} got ${this.data.length} bytes of data`);
}

PrometheusDataCollector.prototype.increaseErrorCounter = function() {
    this.errorCounter++;
    if (this.errorCounter > MaxErrorCounter) {
        if (this.onServerDelete) {
            this.onServerDelete (this.server);
        }
    }
}

PrometheusDataCollector.prototype.processPrometheusResponse = function(resp) {
    // console.log(`Response from this.server:\nSTATUS: ${resp.statusCode}\nHEADERS: ${JSON.stringify(resp.headers, null, 4)}`);
    var thisObj = this;
    if (resp.statusCode == 200) {
        var bodyChunks = [];
        resp.on('data', function(chunk) { bodyChunks.push(chunk); })
            .on('end', function() {
                var data = Buffer.concat(bodyChunks);
                console.log(`Got ${data.length} bytes of data`);
                thisObj.setData(data);
            });
    } else {
        console.log(`Failed to get data from ${this.server}: ${resp.statusCode}`);
        this.increaseErrorCounter();
    }
}

PrometheusDataCollector.prototype.processPrometheusError = function(err) {
    console.log(`Failed to get response from ${this.server} - ${err}`);
    this.increaseErrorCounter();
}

PrometheusDataCollector.prototype.collectPrometheusData = function() {
    console.log(`Sending request to ${this.server}/metrics`);
    const that = this;
    var req = http.get(this.options, function(resp) { that.processPrometheusResponse(resp); })
        .on('error', function(err) { that.processPrometheusError(err); });
}

// ------------------------------------------------
// STATIC methods
function sendResponse (query, resp, msg) {
    if (query.callback) {
        resp.setHeader ("Content-Type", "application/javascript");
        msg = query.callback + "([" + msg + "]);";
    }
    else {
        resp.setHeader ("Content-Type", "application/json");
    }
    resp.send(msg);
}


// ------------------------------------------------
// PUBLIC methods

Prometheus.prototype.getServer = function (req, resp) {
    const query = req.query;
    if (query.server) {
        return query.server;
    } else {
        if (query.port) {
            console.log ("Server is not provided. Port = " + query.port);
            console.log ("req.headers['x-forwarded-for'] = " + req.headers['x-forwarded-for']);
            console.log ("req.headers['x-real-ip'] = " + req.headers['x-real-ip']);
            console.log ("req.connection.remoteAddress = " + req.connection.remoteAddress)
            let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            if (ip) {
                const ips = ip.split (":");
                ip = ips [ips.length-1];
            }
            const server = `${ip}:${query.port}`;
            console.log (`Server: ${server}`);
            return server;
        }
        const obj = { success: false, message: "Server or port is not provided", result: ketMapKeys(this.collectors.keys()) };
        let respBody = JSON.stringify(obj);
        sendResponse (query, resp, respBody);
    }
    return false;
}

Prometheus.prototype.processAddRequest = function(req, resp) {
    const server = this.getServer(req, resp);
    console.log(`Adding server ${server}`);
    if (server) {
        if (!this.collectors.has(server)) {
            const that = this;
            this.collectors.set(server, new PrometheusDataCollector(server, function (server) { that.deleteServer (server);}));
            if (this.dataCollectInterval == null) {
                this.start();
            }
        }
        const obj = { success: true, result: ketMapKeys(this.collectors.keys()) }
        sendResponse (req.query, resp, JSON.stringify(obj));
    }
}

Prometheus.prototype.deleteServer = function (server) {
    console.log (`!! Server ${server} is unresponsive => removing from server list.`);
    this.collectors.delete(server);
}

Prometheus.prototype.processRemoveRequest = function(req, resp) {
    const server = this.getServer(req, resp);
    console.log(`Removing server ${server}`);
    if (server) {
        if (this.collectors.has(server)) {
            this.deleteServer (server);
        }
        const obj = { success: true, result: ketMapKeys(this.collectors.keys()) }
        sendResponse (req.query, resp, JSON.stringify(obj));
    }
}

Prometheus.prototype.collectPrometheusData = function() {
    console.log("Start collecting data.");
    for (const collector of this.collectors.values()) {
        collector.collectPrometheusData();
    }
}

Prometheus.prototype.setDataCollectionInterval = function(interval) {
    if (interval != this.dataCollectIntervalSec || this.dataCollectInterval == null) {
        if (this.dataCollectInterval != null) {
            clearInterval(this.dataCollectInterval);
        }
        this.dataCollectIntervalSec = interval;
        console.log(`Data collection interval is set to ${this.dataCollectIntervalSec/1000} sec`);
        const that = this;
        this.dataCollectInterval = setInterval(function() { that.collectPrometheusData(); }, this.dataCollectIntervalSec);
    }
}

Prometheus.prototype.processSetRequest = function(query, resp) {
    let obj;
    if (query.timeout) {
        let interval = parseInt(query.timeout);
        if (interval > 0) {
            interval = interval * 1000; // convert seconds in millis
            this.setDataCollectionInterval(interval);
            obj = { success: true, result: this.dataCollectIntervalSec };
        }
    } else {
        obj = { success: false, message: "Timeout is not provided", result: dataCollectIntervalSec };
    }
    sendResponse (req.query, resp, JSON.stringify(obj));
}

Prometheus.prototype.getPrometheusData = function() {
    console.log("Collecting Prometheus data from servers");
    let data = "";
    for (const collector of this.collectors.values()) {
        data += collector.getData();
    }
    return data;
}


Prometheus.prototype.processPrometheusRequest = function(req, resp) {
    console.log("Getting Prometheus data");
    let data = this.getPrometheusData();
    console.log(`Sending ${data.length} bytes of data`);
    if (req.query.callback) {
        resp.setHeader ("Content-Type", "application/javascript");
        data = req.query.callback + "([" + JSON.stringify (data) + "]);";
    }
    else {
        resp.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
    }
    resp.write (data);
    resp.end();
}

Prometheus.prototype.start = function() {
    this.setDataCollectionInterval(this.DefaultDataCollectionIntervalSec);
}

// ------------------------------------------------

module.exports = new Prometheus();