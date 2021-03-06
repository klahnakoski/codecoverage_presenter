/**
*
* This is the interface for all types of queries. It is used in JsonCcov
* to perform any given query using the performQuery() method.
*
* The default for performing a query is to simply return an empty object
* if the performQuery() method was not redefined.
*
*/


class Query {
    constructor (testParams) {
        this.testParameters = testParams
    }

    performQuery (){
        var x = {};
        return x;
    }
}

/**
*
* API to perform queries on Active Data JSON code coverage.
*
* Use setQuery() to give an object that inherits from Query that
* represents the query that needs to be performed.
*
* Use setQuries() if multiple queries are to be done. getQueriesResults()
* must be used after using this if all the queries are to be executed
* at once.
*
* Use getQueryResults to execute the query given through setQuery.
* By default, if setQuery() was not called beforehand with a query type,
* it will return nothing. Otherwise, it will return a json formatted
* object that will contain the results.
*
* Use getQueriesResults() to execute all the queries given through setQueries().
* This function cannot be used in 'queries' has not initialized through setQueries().
* If 'queries' is not initialized, an empty object is returned. Otherwise,
* an object containing the JSON formatted responses to each query will be
* returned.
*
*/

class JsonCcov {
    constructor () {
        this.queryType = new Query();
        this.queries = [];
        this.result = {};
    }

    setQuery (queryTypeToDo) {
        this.queryType = queryTypeToDo;
    }

    setQueries (queriesToDo) {
        this.queries = queriesToDo;
    }

    storeResults (callback){
        console.log("This next line is output once the query is finished. It has values in the object.")
        console.log(this.result);
        return callback;
    }

    _callBack (source){
        console.log("Ended the query.");
        return source;
    }

    getQueryResults (callback) {
        console.log(this.queryType);
        if (this.queries && !this.queryType) {
            return {};
        }

        var queryDone = this.queryType;

        queryDone.performQuery(callback);
    }

    getQueriesResults () {
        if (!this.queries) {
            return {};
        }
        var results = [];

        this.queries.forEach(function (element, index) {
            results.add(element.performQuery());
        });

        return results;
    }
}


/**
*
* Add one class for each type of query. They must implement perform query
* and they must also inherit from Query.
*
*/



var search = function(query, callback){
    $.ajax("https://activedata.allizom.org/query", {
        type: "POST",
        data: JSON.stringify(query),
        success: callback
    });
};


/**
* This query can be used to find all the source files that were accessed by
* the given test.
*/
class QueryFilesOfTest extends Query {
    constructor (testParams) {
        super(testParams);
    }

    performQuery (callback) {
        var testToDo = this.testParameters;

        search(
          {
              "limit": 10000,
              "where": testToDo,
              "groupby": ["source.file.name"],
              "from": "coverage-summary"
          },
          callback
        );
    }
}

/**
* This query can be used to find all the test files that access
* a given source files.
*/
class QueryTestsOfSource extends Query {
    constructor (testParams) {
        super(testParams);
    }

    performQuery(callback){
        var testToDo = this.testParameters;

        search(
          {
              "limit": 10000,
              "where": testToDo,
              "groupby": ["test.url"],
              "from": "coverage-summary"
          },
          callback
        );
    }
}

class QueryCommonFiles extends Query {
    constructor (testParams) {
        super(testParams);
    }

    performQuery (callback) {
        var testToDo = this.testParameters;

        var coverage = null;
        var sources_by_test={};
        var commonSources = null;

        search({
            "from":"coverage-summary",
            "where": { prefix: testToDo },
            "groupby":[
                {"name":"test", "value":"test.url"},
                {"name":"source", "value":"source.file"}
            ],
            "limit":10000,
            "format":"list"
            },
            function(coverage) {
                //MAP EACH TEST TO THE SET OF FILES COVERED
                coverage.data.forEach(function(d, i){
                    sources_by_test[d.test] = coalesce(sources_by_test[d.test], {});
                    sources_by_test[d.test][d.source]=true;  // USE THE KEYS OF THE OBJECT AS SET
                });

                //FIND THE INTERSECTION OF COVERED FILES
                Map.forall(sources_by_test, function(test, sourceList){
                    if (commonSources==null) {
                        commonSources = Map.keys(sourceList);
                    }else{
                        commonSources = commonSources.intersect(Map.keys(sourceList));
                    }//endif
                });
              }
            );



        var coverage;
        search(
            {
            "from":"coverage-summary",
            "where": { prefix: testToDo },
            "edges":[
                {"name":"source", "value":"source.file"},
                {"name": "test", "value": "test.url", "allowNulls": false}
            ],
            "limit":10000,
            "format":"cube"
            },
            function(coverage) {
                //edges[0] DESCRIBES THE source DIMENSION, WE SELECT ALL PARTS OF THE DOMAIN
                var all_sources = coverage.edges[0].domain.partitions.select("value");
                //DATA IS IN {"count": [source][test]} PIVOT TABLE
                var commonSources=[];
                coverage.data.count.forall(function(tests, i){
                    //VERIFY THIS source TOUCHES ALL TESTS (count>0)
                    if (Array.AND(tests.map(function(v){return v>0;}))) {
                        commonSources.append(all_sources[i]);
                    }//endif
                });
                callback(commonSources);
            }
        );
    }
}

class QueryDXRFile extends Query{
    constructor (testParams) {
        super(testParams);
    }

    performQuery(callback){
        var testToDo = this.testParameters;

        var tempArray = testToDo.split("/");

        var tempString = "";

        for(var i = 5; i < tempArray.length; i++){
            tempString += "/" + tempArray[i];
        }

        var lineArr = tempString.split("#");

        search(
            {
                "from": "coverage.source.file.covered",
                "limit": 10000,
                "where": {
                     "contains": { "source.file.name": lineArr[0] }
                },
                "groupby": ["line"]

            },
            callback
        );
    }
}


/**
* Returns a list of tests that should be run for the patch that is given to this class in a JSON format.
* i.e. "http://hg.mozilla.org/mozilla-central/json-diff/14eb89c4134db16845dedf5fddd2fb0a7f70497f/tools/profiler/core/platform.h"
**/
class QueryTestsForPatch extends Query {
    constructor (testParams) {
        super(testParams);
    }

    performQuery(callback){
        var testToDo = this.testParameters;

        $.getJSON("http://hg.mozilla.org/mozilla-central/json-diff/14eb89c4134db16845dedf5fddd2fb0a7f70497f/tools/profiler/core/platform.h", function(jsonData){
            console.log("obtained.");
            console.log(jsonData);
            callback(jsonData);
        });
    }
}

class QueryRelevancyOfSources extends Query {
    constructor(testparams){
        super(testparams);
    }

    performQuery (callback) {
        var testToDo = this.testParameters

        var coverage = null;

        var relevancy = {
            sourceFile: "",
            relevancy: 0
        }

        var relevancyArray = [ ];

        search(
            {
                "limit":10000,
                "where":testToDo,
                "groupby":["source.file.name","line"],
                "from":"coverage.source.file.covered"
            }
            , function(coverage){

                search(
                  {
                      "limit": 10000,
                      "groupby": ["test.url"],
                      "from": "coverage-summary",
                      "limit":10000
                  },
                  function(totalTests){
                      var prevSource = "";
                      coverage.data.forEach(function(element, index, array){
                          relevancy.sourceFile = element[0];
                          var param = {
                            "eq":{
                                "source.file": relevancy.sourceFile,
                                "line": element[1]
                            }
                          };
                          search(
                                {
                                    "select":{"value":"test.url", "aggregate":"count"},
                                    "from":"coverage.source.file.covered",
                                    "where":{"and":[
                                        {"missing":"source.method.name"},
                                        {"eq":{
                                            "source.file.name": relevancy.sourceFile,
                                            "source.file.covered.line": element[1]
                                        }}
                                    ]},
                                    "groupby":["test.url"],
                                    "format":"list",
                                    "limit":10000
                                },
                                function(testsTouched){
                                    relevancy.sourceFile = element[0];

                                    console.log("element" + element[0]);
                                    var count = testsTouched.data.length;

                                    var testsOverTotal = count/(totalTests.data.length);

                                    var relevance =  (1 - testsOverTotal)/(1 + testsOverTotal);

                                    if(prevSource != relevancy.sourceFile){
                                        console.log("pushing" + index);
                                        relevancyArray.push({
                                            sourceFile: relevancy.sourceFile,
                                            relevancy: relevance
                                        });
                                    }
                                    else{
                                        for(var i = 0; i < relevancyArray.length; i++){
                                            if(relevancyArray[i].sourceFile == prevSource){
                                                if(count == 1){
                                                    relevancyArray[i].relevancy = 1;
                                                }
                                                if(relevance > relevancyArray[i].relevancy){
                                                    relevancyArray[i].relevancy = relevance;
                                                }
                                                break;
                                            }
                                        }
                                    }

                                    console.log(prevSource + "\n" + relevancy.sourceFile);
                                    prevSource = relevancy.sourceFile;
                                    console.log(index);
                                    console.log(array.length - 1);
                                    if(index == array.length-1){
                                        callback(relevancyArray);
                                    }

                                }
                          ); // End count
                      }); // End coverage for each
                  }// End total tests
                );
        }); // End coverage search
    }
}

class QueryCustom extends Query {
    constructor(testparams){
        super(testparams);
    }

    performQuery (callback) {
        var testToDo = this.testParameters

        search(testToDo, callback);
    }
}
