import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";
import { SharedArray } from "k6/data";

// Custom metrics
const responseTimeTrend = new Trend("response_time");
const requestsPerSecond = new Rate("requests_per_second");
const successRate = new Rate("success_rate");
const errorCounter = new Counter("error_counter");

// Test configuration
export const options = {
  scenarios: {
    constant_load: {
      executor: 'per-vu-iterations',
      vus: 100,               // Fixed number of Virtual Users
      iterations: 100,        // Each VU performs 100 iterations (10,000 total)
      maxDuration: '5m',      // Safety timeout
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<50'],
    'success_rate': ['rate>0.95'],
  },
};

// Optional: Define different endpoints to test
const endpoints = new SharedArray("endpoints", function () {
  return [
    "/api/health",
    "/api/status",
    "/api/data",
    "/api/users",
    "/api/products",
  ];
});

export default function () {
  // Select a random endpoint from our list
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

  // Replace with your actual server URL
  const url = `http://localhost:3000/`;

  // Send the GET request
  const response = http.get(url);

  // Track metrics
  responseTimeTrend.add(response.timings.duration);
  requestsPerSecond.add(1);

  // Check if the request was successful (status code 200-299)
  const success = check(response, {
    "status is 2xx": (r) => r.status >= 200 && r.status < 300,
    "response time < 200ms": (r) => r.timings.duration < 200,
  });

  // Track success/failure
  successRate.add(success);

  if (!success) {
    errorCounter.add(1);
    console.log(
      `Failed request: ${url}, Status: ${response.status}, Duration: ${response.timings.duration}ms`
    );
  }

  // Small sleep to prevent CPU overload but consistent across all test runs
  sleep(0.1); // Fixed 100ms pause between requests from same VU
}

// Summary function that runs after the test
export function handleSummary(data) {
  console.log("Test completed!");

  return {
    stdout: JSON.stringify(data, null, 2),
    "./summary.json": JSON.stringify(data),
    "./summary.html": generateHtmlReport(data),
  };
}

// Helper function to generate a simple HTML report
function generateHtmlReport(data) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>K6 Load Test Results</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #2c3e50; }
          .metric { margin-bottom: 20px; }
          .metric h2 { color: #3498db; }
          .good { color: green; }
          .bad { color: red; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h1>Load Test Results - 10K GET Requests</h1>
        
        <div class="metric">
          <h2>Overview</h2>
          <p>Total Requests: ${data.metrics.iterations.count}</p>
          <p>Virtual Users (max): ${data.metrics.vus_max.max}</p>
          <p>Test Duration: ${data.state.testRunDurationMs / 1000}s</p>
        </div>
        
        <div class="metric">
          <h2>Response Time</h2>
          <p>Min: ${data.metrics.response_time.min.toFixed(2)}ms</p>
          <p>Max: ${data.metrics.response_time.max.toFixed(2)}ms</p>
          <p>Average: ${data.metrics.response_time.avg.toFixed(2)}ms</p>
          <p>Median (p50): ${data.metrics.response_time.med.toFixed(2)}ms</p>
          <p>p90: ${data.metrics.response_time["p(90)"].toFixed(2)}ms</p>
          <p>p95: ${data.metrics.response_time["p(95)"].toFixed(2)}ms</p>
          <p>p99: ${data.metrics.response_time["p(99)"].toFixed(2)}ms</p>
        </div>
        
        <div class="metric">
          <h2>Throughput</h2>
          <p>Requests/second: ${data.metrics.requests_per_second.rate.toFixed(
            2
          )}</p>
        </div>
        
        <div class="metric">
          <h2>Success Rate</h2>
          <p class="${data.metrics.success_rate.rate > 0.95 ? "good" : "bad"}">
            ${(data.metrics.success_rate.rate * 100).toFixed(2)}%
          </p>
        </div>
        
        <div class="metric">
          <h2>Errors</h2>
          <p>Total Errors: ${
            data.metrics.error_counter ? data.metrics.error_counter.count : 0
          }</p>
        </div>
      </body>
    </html>
  `;
}
