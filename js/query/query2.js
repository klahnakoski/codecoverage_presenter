/**
 * Given a test, which unique files does it touch?
 */
function prepareQuery2(param) {
    addTests(param);
}

function executeQuery2Manual() {
    var select2 = $("#select2");
    var test = select2.val();
    if (!test) return;
    var buildRevision = $("#selectBuildRevision").val();

    executeQuery2({
        "eq": {
            "test.url": test,
            "build.revision": buildRevision
        }
    });
}

function executeQuery2(filter) {
    showBuildInfo(filter.eq["build.revision"]);

    Thread.run(function*(){
        // disable inputs while query is running
        disableAll(true);

        // get source files covered by test
        var sources = yield (search({
            "from": "coverage-summary",
            "where": filter,
            "groupby": [
                {"name": "source", "value": "source.file.name"}
            ],
            "limit": 100000,
            "format": "list"
        }));

        // for each file, find number of other tests
        var siblings = yield (search({
            // find test that cover the same
            "from": "coverage-summary",
            "select": {"name": "tests", "value": "test.url", "aggregate": "union"},
            "where": {
                "in": {
                    "source.file.name": sources.data.select("source")
                }
                // TODO: do we need to specify build revision here?
            },
            "groupby": [
                {"name": "source", "value": "source.file.name"}
            ],
            "limit": 100000,
            "format": "list"
        }));
        siblings.data = qb.sort(siblings.data, "tests.length");

        // remove self
        var test = filter.eq["test.url"];
        siblings.data.forall(function(v){
            v.tests.remove(test);
        });

        showPermalink();
        $("#resultDesc").text("Unique source files touched by selected test:");

        var table = "<table class='table table-condensed'><tbody>";
        siblings.data.forEach(function(element, index, array) {
            if (element.tests.length > 0) return;
            if (!isTest(element.source)) {
                var tokens = element.source.split("/");
                var sourceName = tokens[tokens.length - 1];
                var dxrLink = getDxrLink(sourceName);
                table += ("<tr><td><a target='_blank' href='" + dxrLink + "'>" + element.source + "</a></td></tr>");
            }
        });
        table += "</tbody></table>";
        $("#resultDiv").html(table);

        // re-enable the inputs
        disableAll(false);
    });
}
