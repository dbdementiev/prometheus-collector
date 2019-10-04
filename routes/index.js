const prometheus = require("../prometheus.js");
var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/add', function(req, res, next) {
    prometheus.processAddRequest(req, res);
});
router.get('/remove', function(req, res, next) {
    prometheus.processRemoveRequest(req, res);
});
router.get('/set', function(req, res, next) {
    prometheus.processSetRequest(req.query, res);
});
router.get('/metrics', function(req, res, next) {
    prometheus.processPrometheusRequest(req, res);
});
router.get('/', function(req, res, next) {
    prometheus.processPrometheusRequest(req, res);
});

module.exports = router;