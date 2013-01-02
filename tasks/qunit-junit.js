/*
 * grunt-qunit-junit
 * https://github.com/sbrandwoo/grunt-qunit-junit
 *
 * Copyright (c) 2012 Stephen Brandwood
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function (grunt) {

    var _ = require('underscore'),
        path = require('path'),

        XmlReporter;

    XmlReporter = function (options) {
        this.options = options;

        this.filename = "";
        this.modules = [];
        this.tests = [];
        this.currentLogs = [];
        this.currentErrors = 0;
    };
    _.extend(XmlReporter.prototype, {

        /**
         * Attach event listeners for qunit events.
         * @param  {EventEmitter} emitter  emitter of the qunit events
         */
        attach: function (emitter) {
            _.each([
                ['qunit.spawn', this.handleSpawn],
                ['qunit.begin', this.handleBegin],
                ['qunit.moduleStart', this.handleModuleStart],
                ['qunit.testStart', this.handleTestStart],
                ['qunit.log', this.handleLog],
                ['qunit.testDone', this.handleTestDone],
                ['qunit.moduleDone', this.handleModuleDone],
                ['qunit.done', this.handleDone],
                ['qunit.fail.timeout', this.handleTimeout]
            ], function (a) {
                // Bind events to the local method (_.bind sets `this`)
                emitter.on(a[0], _.bind(a[1], this));
            }, this);
        },

        escape: function (value) {
            return value.replace(/&/g, '&amp;')
                       .replace(/</g, '&lt;')
                       .replace(/>/g, '&gt;')
                       .replace(/"/g, '&quot;');
        },

        handleSpawn: function (url) {
            this.classname = this.options.namer.call(null, url);
            this.filename = 'TEST-' + this.classname + '.xml';
        },

        handleBegin: function () {
        },

        handleModuleStart: function (name) {
            if (this.tests.length) {
                // TODO: Investigate the various routes to this spot,
                // and how we can create correct counts
                this.handleModuleDone("global", 1, 1, 1);
            }
        },

        handleTestStart: function (name) {
            this.currentLogs = [];
            this.currentErrors = 0;
        },

        handleLog: function (result, actual, expected, message, source) {
            var match,
                stack = null,
                type = "failure";
            if (!result) {
                // Detect script errors and parse out the meaningful bits
                match = message.match(/(Died on test #[0-9]+)[\ \t]+([\s\S]*)[0-9]+:\ (.*)/);
                if (match) {
                    message = match[1] + ": " + match[3];
                    stack = match[2];
                    type = "error";
                    this.currentErrors += 1;
                }
                this.currentLogs.push({
                    actual: actual,
                    expected: expected,
                    message: message,
                    stack: stack,
                    type: type
                });
            }
        },

        handleTestDone: function (name, failed, passed, total) {
            this.tests.push({
                name: name,
                errored: this.currentErrors,
                failed: failed - this.currentErrors,
                passed: passed,
                total: total,
                logs: this.currentLogs
            });

            this.currentLogs = null;
            this.currentErrors = 0;
        },

        handleModuleDone: function (name, failed, passed, total) {
            var totalErrors = 0;
            this.tests.forEach(function (test) {
                totalErrors += test.errored;
            });
            var data = {
                name: name,
                errored: totalErrors,
                failed: failed - totalErrors,
                passed: passed,
                total: total,
                tests: this.tests
            };
            this.modules.push(data);

            this.tests = [];
        },

        handleDone: function (failed, passed, total, runtime) {

            var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n',
                filePath = path.join(this.options.dest, this.filename);

            if (this.tests.length) {
                // Must have been no modules
                this.handleModuleDone('main', failed, passed, total);
            }

            _.each(this.modules, function (module) {
                xml += '\t<testsuite'
                    + ' name="' + this.escape(this.classname) + '"'
                    + ' errors="' + module.errored + '"'
                    + ' failures="' + module.failed + '"'
                    + ' tests="' + module.tests.length + '">\n';
                _.each(module.tests, function (test) {
                    xml += '\t\t<testcase'
                        + ' classname="' + this.escape(this.classname) + '"'
                        + ' name="' + this.escape(module.name + ": " + test.name) + '"'
                        + ' assertions="' + test.total + '">\n';
                    _.each(test.logs, function (data) {
                        xml += '\t\t\t<' + data.type + ' type="failed" message="'
                                + this.escape(data.message) + '">\n';
                        if (data.stack) {
                            xml += '\t' + this.escape(data.stack) + '\n';
                        }
                        xml += '\t\t\t</' + data.type + '>\n';
                    }, this);
                    xml += "\t\t</testcase>\n";
                }, this);
                xml += "\t</testsuite>\n";
            }, this);
            xml += "</testsuites>\n";

            grunt.log.ok("Writing results to " + filePath);
            grunt.file.write(filePath, xml);

            this.filename = null;
            this.classname = null;
            this.modules = [];
        },

        handleTimeout: function () {

            var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n',
                filePath = path.join(this.options.dest, this.filename);

            xml += '\t<testsuite'
                + ' name="' + this.escape(this.classname) + '"'
                + ' errors="1"'
                + ' failures="0"'
                + ' tests="1">\n';
            xml += '\t\t<testcase'
                + ' classname="' + this.escape(this.classname) + '"'
                + ' name="main"'
                + ' assertions="1">\n';
            xml += '\t\t\t<error type="timeout" message="Test timed out, '
                + 'possibly due to a missing QUnit.start() call."></error>\n';
            xml += "\t\t</testcase>\n";
            xml += "\t</testsuite>\n";
            xml += "</testsuites>\n";

            grunt.log.ok("Writing timeout report to " + filePath);
            grunt.file.write(filePath, xml);
        }
    });


    grunt.registerTask('qunit_junit',
            'Log JUnit style XML reports for QUnit tests', function () {
        var options = this.options({
                dest: '_build/test-reports',
                namer: function (url) {
                    return path.basename(url).replace(/\.html$/, '');
                }
            }),
            reporter = new XmlReporter(options);
        reporter.attach(grunt.event);
        grunt.log.ok("XML reports will be written to " + options.dest);
    });
};
