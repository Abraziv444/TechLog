Bouncie API
v1.0.0
Data Integration Specification
Bouncie offers data integrations in two varieties:

Webhooks (push)
Rest API Endpoints (pull)
The registration and setup for your application with Bouncie is done through the Bouncie Developer Portal.

Navigation
Authorization
Webhooks
Geo-Zones
Zapier Integration
FAQ
Authorization
Bouncie API uses User Authentication with OAuth 2.0 to authorize users for your application.

To obtain Authorization, you must first register your application on the Bouncie Developer Portal and follow the authorization code flow below.

You prompt your user to a webpage where they can give you permission to access their data.
Once your user has approved, they will be redirected back to a redirect uri that you will have initially set up for your application on the Bouncie Developer Portal with an authorization code as a query parameter (This step is enough to start receiving events for any webhooks you have registered).
You then use that authorization code to get an access token which can be used to make requests to Bouncie API REST endpoints.
1. Have your application request authorization; the user will log in using their Bouncie account and grant access.
To request authorization, redirect your user to https://auth.bouncie.com/dialog/authorize with the following parameters:

Request Query Parameter	Value
client_id	This value is required. When you set up your application on the Bouncie Developer Portal, you can set your Client ID
response_type	This value is required. It should be set to "code"
redirect_uri	This value is required. This is the URI the user will be redirected back to once they have granted permission. The URI needs to have been added to your application's Redirect URI list on the Bouncie Developer Portal. The value of this parameter must exactly match one of the Redirect URIs you have set up, including upper or lowercase, terminal slashes etc
state	This value is optional. When the user is redirected back to your app, whatever value you include as the state will also be included in the redirect. You can check to see if the value you sent for state is the same as the value you got back for added security
code_challenge	This value is optional. Base64Url encoded code_verifier for using PKCE.
code_challenge_method	This value is optional. S256 (recommended) or plain. Defaults to S256 if code_challenge is provided.
resource	This value is optional. URI of the protected resource (e.g. https://api.bouncie.dev/v1/). Echoed as aud claim in the access token per RFC 8707.
For more information on using PKCE see the RFC

Example
An example of an authorization URL:

https://auth.bouncie.com/dialog/authorize?client_id=my-app&redirect_uri=http://www.example.com/&response_type=code&state=abcdefg

An example of the response URL if the user grants permission:

http://www.example.com/?code=I1uHE12LIK123PQRmnoGD1RnR12Ybrr99Tio1SQRpow12dabc&state=abcdefg

Response Query Parameter	Value
code	An authorization code that can be exchanged for an access token. There is no expiration for the authorization code, however if the user goes through the authorization flow for your application again and a new authorization code is generated, the old authorization code will no longer be valid
state	The value of the state parameter supplied in the request.
At this point, if you have any Webhooks set up, you will start receiving events for the user that has just granted your application permission
2. Have your application request access tokens.
Once you have received an authorization code, you will need to exchange it with an access token by making a POST request to https://auth.bouncie.com/oauth/token. The body of this POST (JSON) will be as follows:

Request Header Field	Value
Content-Type	application/json
Request Body Field	Value
client_id	This value is required. When you set up your application on the Bouncie Developer Portal, you can set your Client ID
client_secret	This value is required. It is provided to you when you set up your application on the Bouncie Developer Portal
grant_type	This value is required. It must be set to "authorization_code"
code	This value is required. It is the authorization code returned by the initial https://auth.bouncie.com/dialog/authorize endpoint
redirect_uri	This value is required. It must match one of the Redirect URI's you have set up for your application on the Bouncie Developer Portal. This value is ONLY used for validation, there is no actual redirection that happens here
code_verifier	This value is required if you are using PKCE.
An alternative way to send the Client ID and the Client Secret is as an authorization header with the value set to a base64 encoded string as follows:

Request Header Field	Value
Content-Type	application/json
Authorization	If you do not send the Client ID and the Client Secret as part of the request body, you can send it using the Authorization header. The value must be a base64 encoded string and must have the following format Authorization: Basic < base64 encoded client_id:client_secret >
A successful request for the access token will yield a JSON response with the following fields:

Response field	Value Type	Value Description
access_token	string	An access token that can be provided in subsequent calls to Bouncie API REST endpoints
refresh_token	string	A refresh token that can be exchanged for a new access token
expires_in	int	The time period (in seconds) for which the access token is valid.
token_type	string	Describes how the access token may be used. It is always set to "Bearer".
You can now make calls to Bouncie API REST endpoints by sending the access token as the request authorization header.

3. Refresh an expired access token.
Once your access token has expired, you will need to exchange your refresh token for a new access token by making another POST request to https://auth.bouncie.com/oauth/token. The body of this POST (JSON) will be as follows:

Request Header Field	Value
Content-Type	application/json
Request Body Field	Value
client_id	This value is required. When you set up your application on the Bouncie Developer Portal, you can set your Client ID
client_secret	This value is required. It is provided to you when you set up your application on the Bouncie Developer Portal
grant_type	This value is required. It must be set to "refresh_token"
refresh_token	This value is required. It is the refresh token returned by the previous request to the https://auth.bouncie.com/oauth/token endpoint
A successful request will yield a JSON response with the same fields as the previous request with a new access token and new refresh token. The previous refresh token will no longer be valid. Each refresh token will expire after some time if it is not used. If the refresh token expires, you can generate a new one by making a POST request to the https://auth.bouncie.com/oauth/token endpoint again with the same POST body as described in step 2.

Webhooks
Webhooks can be used to be notified about events occurring on your vehicle. This can greatly your simplify the overhead for loading data, since polling the restful APIs may no longer be necessary.

Configuration is simple: Provide Bouncie secure server side URL endpoint and specify the types of events you wish to receive. (ex: https://myapp.mycompany.com/bouncie-webhook). Webhooks can be set up for your application on the Bouncie Developer Portal.

That’s it! Now when an event occurs for your any of your connected vehicles. Bouncie will POST JSON event payloads to your endpoint in real time.

Webhook Security
Webhooks use a unique key that you provide to secure calls. An Authorization header will be sent with every outgoing webhook that you can use to validate that the incoming request is actually from Bouncie.

Additionally, Bouncie provides an X-Bouncie-Authorization header that is also included with every outgoing webhook. This header will have the same value as the Authorization header and can be used for validation in the same manner. Bouncie provides this header in the event that the platform your app is running on has removed the Authorization header.

// HTTP Headers
{
  "Authorization": "yourKey",
  "X-Bouncie-Authorization": "yourKey",
}
As part of the process of setting up your application you will provide the initial value for this key.

Webhook Key rotation
Webhook consumers can change their unique key by returning a new key in an Authorization response header in the response to the webhook.

Retries
URL endpoint(s) for webkook calls should respond with 2xx level status code to indicate successful receipt.

Bouncie will attempt to retry a webhook Request if it times out, responds with invalid JSON, or responds with a 4xx or 5xx level status code. A backoff policy will be used to prevent overloading the webhook endpoint. Bouncie will continue retrying until the maximum amount of retries are reached.

Event Types
Device
Device Connected
Device Disconnected
VIN Change
Vehicle Health
MIL
Low Battery
Trips
Trip Start
Trip Data
Trip Metrics
Trip End
Geo-Zones
Application Geo-Zone
User Geo-Zone
Rest API Endpoints
Base URL
The base URL is https://api.bouncie.dev/v1/.
All API requests must use HTTPS. Calls made over HTTP will fail.
Successful requests return JSON data (application/json).
Authentication
The Bouncie API uses the access token that is granted to you per user who grants access to their information. This access token is generated when you obtain authorization.

// HTTP Headers
{
  "Authorization": "AccessTokenYouHaveGenerated",
  "Content-Type": "application/json"
}
Responses and Errors
Bouncie API uses standard HTTP response codes to indicate success or failure of an API request.

Responses	Description
200 - OK	A GET request succeeded. JSON response.
201 - Created	A POST response succeeded. JSON response.
400 - Bad Request	The request was unacceptable, often due to missing a required parameter. JSON response{ "errors": "This was a bad request because..." }
401 - Unauthorized	No valid API key provided.
404 - Not Found	The requested resource doesn't exist.
50x - Application Error	An error occurred on Bouncie API
Geo-Zones
Bouncie supports two types of Geo-Zones: User Geo-Zones, which are managed by users, and Application Geo-Zones, which are created and managed through the API.

User Geo-Zones
These are created and managed directly by users through the Bouncie app or web dashboard. Users can set up zones around locations of interest—like home, school, or work—and receive notifications when their vehicle enters or exits these areas. User Geo-Zones are personal and cannot be modified by external integrations.

Application Geo-Zones
Application Geo-Zones are designed for integrations that require programmatically defined zones. These zones are created and managed through the Bouncie API, allowing for dynamic setup and control independent of User Geo-Zones. Application Geo-Zones do not appear in the Bouncie client experience and do not trigger notifications to users.

To create an Application Geo-Zone:

Create a Location: Define the geographic area by specifying coordinates and a radius or a polygon. Refer to the Create Location endpoint for details.
(Optional) Create a Schedule: Define active time periods for the geozone. This step is optional. Refer to the Create Schedule endpoint for details.
Create the Application Geo-Zone: Use the IDs from the Location and Schedule (if applicable) to create the geozone. Refer to the Create Application Geo-Zone endpoint for details.
Zapier Integration
Bouncie has a Zapier integration that allows you to connect Bouncie with other applications. You can use this integration to automate tasks and workflows between Bouncie and other applications without writing any code.

Setup
To use the Zapier integration, you will need to register an application on the Bouncie Developer Portal. Your application must have the following as a redirect URL:

https://zapier.com/dashboard/auth/oauth/return/App220583CLIAPI/
You will be prompted to provide the application's Client ID and Client Secret when connecting your account while creating a Zap with a Bouncie trigger.

This application should only be used with the Zapier integration.

FAQ
Why does the API return a 401 Unauthorized error?
The access token may be expired. See the refresh an expired access token section for more information on how to generate a fresh access token.
The Authorization header value may not be formatted correctly. Make sure to only include the access token and not the "Bearer" prefix.
The application may no longer have access to the user data that the access token was issued for. Verify the user shows up in the list in the Users & Devices tab for the application on the Bouncie Developer Portal.
How much data can I expect to receive from webhooks?
Data volume depends on the number of devices authorized to your account and how often the vehicles they are installed in are driven.
The specific events you subscribe to play a significant role in overall data volume. For example:
battery events are sent only when battery voltage drops below a defined threshold.
tripMetrics is reported once per trip, upon its conclusion.
tripData events are transmitted continuously throughout the entirety of a trip and will make up the bulk of your data volume if enabled.
Devices may occasionally lose cellular connectivity — such as when operating in low-signal areas or parked underground. When this happens, trip data is temporarily stored on the device and transmitted once the connection is reestablished. Although the total volume of events remains unchanged, the data may be sent all at once over a short period of time. This can lead to brief spikes in webhook traffic.
Why do I receive duplicate trip events?
See the trip data documentation for more details on why duplication happens and how to handle it properly in your application.
What happens if a webhook cannot be delivered?
If a webhook request times out or returns a 4xx or 5xx status code, Bouncie will automatically retry the request. Retries follow an exponential backoff policy to avoid overwhelming the receiving server. Retries will continue until a maximum number of attempts is reached.
If a webhook continues to fail after repeated retries, it will be automatically deactivated. This typically happens after prolonged periods of unresponsiveness or error responses. Once deactivated, no further events will be sent to that webhook URL until it is re-enabled.

Bouncie API


Get User
get
https://api.bouncie.dev
/v1/user
Request
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Responses
200
Returns user information for the user associated with the current access token

Body

application/json

application/json
email
string
required
Example:
john.doe@example.com
id
string
required
Example:
65f8a2b4c9d7e1234567890d
name
string
required
Example:
John Doe
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
Send API Request
curl --request GET \
  --url https://api.bouncie.dev/v1/user \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: '
{
  "email": "john.doe@example.com",
  "id": "65f8a2b4c9d7e1234567890d",
  "name": "John Doe"
}

Bouncie API



Search Vehicles
get
https://api.bouncie.dev
/v1/vehicles
Request
Query Parameters
imei
string
Unique bouncie device identifier

limit
number
Number of search results to limit (for paging)

> 0
skip
number
Number of search results to skip (for paging)

> 0
vin
string
Vehicle Identification Number for vehicle

Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Responses
200
Returns an array of vehicles matching the given criteria

Body

application/json

application/json
array of:
model
object
required
Make and Model information for the vehicle

make
string
required
Make of the vehicle

Example:
Honda
name
string
required
Model name of the vehicle

Example:
Accord
year
number
required
Model year of the vehicle

Example:
2022
nickName
string
required
Nickname of the vehicle

Example:
My Honda
standardEngine
string
required
Vehicle engine type

Example:
1.5L 4-Cylinder Turbo
vin
string
required
Vehicle Identification Number for vehicle

Example:
1HGBIQOJXMN109186
imei
string
required
Unique bouncie device identifier

Example:
123456789012345
stats
object
required
Vehicle stats

localTimeZone
string
required
Timezone that the vehicle is currenly located

Example:
America/Chicago
odometer
number
required
Current odometer reading of vehicle

Example:
45678.9
lastUpdated
string<date-time>
required
Last time vehicle document was updated

Example:
2026-01-01T08:30:00.000Z
location
object
If available, last known location of vehicle

fuelLevel
number
required
Percentage of fuel remaining in tank as reported by vehicle

Example:
75.5
isRunning
boolean
required
Indicates whether the vehicle is currently running

Example:
true
speed
number
required
Current speed of vehicle

Example:
45
mil
object
required
Status of Malfunction Indicator Light (check engine light)

imei
:
string
limit
:
number
skip
:
number
vin
:
string
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
Send API Request
curl --request GET \
  --url https://api.bouncie.dev/v1/vehicles \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: '
[
  {
    "model": {
      "make": "Honda",
      "name": "Accord",
      "year": 2022
    },
    "nickName": "My Honda",
    "standardEngine": "1.5L 4-Cylinder Turbo",
    "vin": "1HGBIQOJXMN109186",
    "imei": "123456789012345",
    "stats": {
      "localTimeZone": "America/Chicago",
      "odometer": 45678.9,
      "lastUpdated": "2026-01-01T08:30:00.000Z",
      "location": {
        "lat": 32.7767432,
        "lon": -96.7970123,
        "heading": 135,
        "address": "123 Main Street, Dallas, TX 75201"
      },
      "fuelLevel": 75.5,
      "isRunning": true,
      "speed": 45,
      "mil": {
        "milOn": false,
        "lastUpdated": "2026-01-01T08:30:00.000Z",
        "qualifiedDtcList": [
          {
            "code": "P0420",
            "name": [
              "Catalyst System Efficiency Below Threshold"
            ]
          }
        ],
        "battery": {
          "status": "normal",
          "lastUpdated": "2026-01-01T08:30:00.000Z"
        }
      }
    }
  }
]

Bouncie API


Search Trips
get
https://api.bouncie.dev
/v1/trips
Request
Query Parameters
ends-before
string<date-time>
Will match trips with an ending time before this parameter. The earliest supported date is 2020-05-21.

gps-format
string
One of: polyline or geojson

Allowed values:
geojson
polyline
imei
string
IMEI for the vehicle to retrieve trips for

starts-after
string<date-time>
Will match trips with a starting time after this parameter. The window between starts-after and ends-before must be no longer than a week. If not provided, the last week will be used by default. The earliest supported date is 2020-05-21.

transaction-id
string
Unique Trip Identifier

Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Responses
200
Returns an array of trips matching given criteria

Body

application/json

application/json
array of:
transactionId
string
required
Unique identifier

Example:
123456789012345-1735920000-202501
hardBrakingCount
number
required
Number of hard braking events

Example:
2
hardAccelerationCount
number
required
Number of hard acceleration events

Example:
1
distance
number
required
Distance travelled in miles

Example:
12.5
gps
string
required
GPS data encoded in requested format

Example:
_p~iF~ps|U_ulLnnqC_mqN
startTime
string<date-time>
required
Time trip started

Example:
2026-01-01T010:01:00.000Z
endTime
string<date-time>
required
Time trip ended

Example:
2026-01-01T10:32:00.000Z
startOdometer
number
required
Starting vehicle odometer

Example:
45678.9
endOdometer
number
required
Ending vehicle odometer

Example:
45691.4
averageSpeed
number
required
Average speed in MPH

Example:
35.5
maxSpeed
number
required
Maximum speed in MPH

Example:
65
fuelConsumed
number
required
Amount of fuel consumed in gallons

Example:
0.8
timeZone
string
required
Time zone that vehicle was located in at the start of the trip

Example:
America/Chicago
totalIdleDuration
number
required
Total time spent idling in seconds

Example:
300
imei
string
required
Unique bouncie device identifier

Example:
123456789012345
ends-before
:
string
gps-format
:
Not Setgeojsonpolyline

select an option
imei
:
string
starts-after
:
string
transaction-id
:
string
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
Send API Request
curl --request GET \
  --url https://api.bouncie.dev/v1/trips \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: '
[
  {
    "transactionId": "123456789012345-1735920000-202501",
    "hardBrakingCount": 2,
    "hardAccelerationCount": 1,
    "distance": 12.5,
    "gps": "_p~iF~ps|U_ulLnnqC_mqN",
    "startTime": "2026-01-01T010:01:00.000Z",
    "endTime": "2026-01-01T10:32:00.000Z",
    "startOdometer": 45678.9,
    "endOdometer": 45691.4,
    "averageSpeed": 35.5,
    "maxSpeed": 65,
    "fuelConsumed": 0.8,
    "timeZone": "America/Chicago",
    "totalIdleDuration": 300,
    "imei": "123456789012345"
  }
]

Bouncie API



Get Webhooks
get
https://api.bouncie.dev
/v1/webhooks
Request
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Responses
200
Returns an array of webhooks for the current application

Body

application/json

application/json
array of:
id
string
required
Unique identifier

Example:
65f8a2b4c9d7e1234567890b
name
string
required
Name of the webhook

Example:
Example Webhook
url
string
required
URL to send webhook events to

Example:
https://www.exampleapp.com/webhook
authKey
string
required
Authorization key to use for webhook source verification

Example:
9WVPxCzIUacIehyUKgJkqz4fQaZwnrs9DVy4yB
applicationId
string
required
Application ID that the webhook is associated with

Example:
65f8a2b4c9d7e1234567890c
events
array[string]
required
List of events that the webhook is subscribed to

Allowed values:
tripStart
tripData
tripEnd
tripMetrics
mil
battery
connect
disconnect
vinChange
userGeozone
applicationGeozone
Example:
["tripStart","tripEnd"]
active
boolean
required
Whether the webhook is active

Example:
true
createdAt
string<date-time>
required
Time the webhook was created

Example:
2026-01-01T08:30:00.000Z
updatedAt
string<date-time>
required
Time the webhook was last updated

Example:
2026-01-01T08:30:00.000Z
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
Send API Request
curl --request GET \
  --url https://api.bouncie.dev/v1/webhooks \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: '
[
  {
    "id": "65f8a2b4c9d7e1234567890b",
    "name": "Example Webhook",
    "url": "https://www.exampleapp.com/webhook",
    "authKey": "9WVPxCzIUacIehyUKgJkqz4fQaZwnrs9DVy4yB",
    "applicationId": "65f8a2b4c9d7e1234567890c",
    "events": [
      "tripStart",
      "tripEnd"
    ],
    "active": true,
    "createdAt": "2026-01-01T08:30:00.000Z",
    "updatedAt": "2026-01-01T08:30:00.000Z"
  }
]

Bouncie API



Create Webhook
post
https://api.bouncie.dev
/v1/webhooks
Maximum number of webhooks per application is 100

Request
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Body

application/json

application/json
name
string
required
Name of the webhook

Example:
Example Webhook
url
string<uri>
required
URL to send webhook events to

Example:
https://www.exampleapp.com/webhook
authKey
string
required
Authorization key to use for webhook source verification

Example:
9WVPxCzIUacIehyUKgJkqz4fQaZwnrs9DVy4yB
events
array[string]
required
List of events that the webhook is subscribed to

>= 1 items
Allowed values:
tripStart
tripData
tripEnd
tripMetrics
mil
battery
connect
disconnect
vinChange
userGeozone
applicationGeozone
Example:
["tripStart","tripEnd","mil"]
active
boolean
Whether the webhook is active

Default:
true
Example:
true
Responses
200
Returns the created webhook

Body

application/json

application/json
responses
/
200
id
string
required
Unique identifier

Example:
65f8a2b4c9d7e1234567890b
name
string
required
Name of the webhook

Example:
Example Webhook
url
string
required
URL to send webhook events to

Example:
https://www.exampleapp.com/webhook
authKey
string
required
Authorization key to use for webhook source verification

Example:
9WVPxCzIUacIehyUKgJkqz4fQaZwnrs9DVy4yB
applicationId
string
required
Application ID that the webhook is associated with

Example:
65f8a2b4c9d7e1234567890c
events
array[string]
required
List of events that the webhook is subscribed to

Allowed values:
tripStart
tripData
tripEnd
tripMetrics
mil
battery
connect
disconnect
vinChange
userGeozone
applicationGeozone
Example:
["tripStart","tripEnd"]
active
boolean
required
Whether the webhook is active

Example:
true
createdAt
string<date-time>
required
Time the webhook was created

Example:
2026-01-01T08:30:00.000Z
updatedAt
string<date-time>
required
Time the webhook was last updated

Example:
2026-01-01T08:30:00.000Z
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
{
  "name": "Example Webhook",
  "url": "https://www.exampleapp.com/webhook",
  "authKey": "9WVPxCzIUacIehyUKgJkqz4fQaZwnrs9DVy4yB",
  "events": [
    "tripStart",
    "tripEnd",
    "mil"
  ],
  "active": true
}
{
  "name": "Example Webhook",
  "url": "https://www.exampleapp.com/webhook",
  "authKey": "9WVPxCzIUacIehyUKgJkqz4fQaZwnrs9DVy4yB",
  "events": [
    "tripStart",
    "tripEnd",
    "mil"
  ],
  "active": true
}
Send API Request
curl --request POST \
  --url https://api.bouncie.dev/v1/webhooks \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: application/json' \
  --data '{
  "name": "Example Webhook",
  "url": "https://www.exampleapp.com/webhook",
  "authKey": "9WVPxCzIUacIehyUKgJkqz4fQaZwnrs9DVy4yB",
  "events": [
    "tripStart",
    "tripEnd",
    "mil"
  ],
  "active": true
}'
{
  "id": "65f8a2b4c9d7e1234567890b",
  "name": "Example Webhook",
  "url": "https://www.exampleapp.com/webhook",
  "authKey": "9WVPxCzIUacIehyUKgJkqz4fQaZwnrs9DVy4yB",
  "applicationId": "65f8a2b4c9d7e1234567890c",
  "events": [
    "tripStart",
    "tripEnd"
  ],
  "active": true,
  "createdAt": "2026-01-01T08:30:00.000Z",
  "updatedAt": "2026-01-01T08:30:00.000Z"
}

Bouncie API



Update Webhook
put
https://api.bouncie.dev
/v1/webhooks/{webhookId}
Request
Path Parameters
webhookId
string
required
Match pattern:
^:webhookId$
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Body

application/json

application/json
name
string
required
Name of the webhook

Example:
Example Webhook
url
string<uri>
required
URL to send webhook events to

Example:
https://www.exampleapp.com/webhook
authKey
string
required
Authorization key to use for webhook source verification

Example:
9WVPxCzIUacIehyUKgJkqz4fQaZwnrs9DVy4yB
events
array[string]
required
List of events that the webhook is subscribed to

>= 1 items
Allowed values:
tripStart
tripData
tripEnd
tripMetrics
mil
battery
connect
disconnect
vinChange
userGeozone
applicationGeozone
Example:
["tripStart","tripEnd","mil"]
active
boolean
Whether the webhook is active

Default:
true
Example:
true
Responses
200
Returns the updated webhook

Body

application/json

application/json
responses
/
200
id
string
required
Unique identifier

Example:
65f8a2b4c9d7e1234567890b
name
string
required
Name of the webhook

Example:
Example Webhook
url
string
required
URL to send webhook events to

Example:
https://www.exampleapp.com/webhook
authKey
string
required
Authorization key to use for webhook source verification

Example:
9WVPxCzIUacIehyUKgJkqz4fQaZwnrs9DVy4yB
applicationId
string
required
Application ID that the webhook is associated with

Example:
65f8a2b4c9d7e1234567890c
events
array[string]
required
List of events that the webhook is subscribed to

Allowed values:
tripStart
tripData
tripEnd
tripMetrics
mil
battery
connect
disconnect
vinChange
userGeozone
applicationGeozone
Example:
["tripStart","tripEnd"]
active
boolean
required
Whether the webhook is active

Example:
true
createdAt
string<date-time>
required
Time the webhook was created

Example:
2026-01-01T08:30:00.000Z
updatedAt
string<date-time>
required
Time the webhook was last updated

Example:
2026-01-01T08:30:00.000Z
webhookId*
:
string
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
{
  "name": "Example Webhook",
  "url": "https://www.exampleapp.com/webhook",
  "authKey": "9WVPxCzIUacIehyUKgJkqz4fQaZwnrs9DVy4yB",
  "events": [
    "tripStart",
    "tripEnd",
    "mil"
  ],
  "active": true
}
{
  "name": "Example Webhook",
  "url": "https://www.exampleapp.com/webhook",
  "authKey": "9WVPxCzIUacIehyUKgJkqz4fQaZwnrs9DVy4yB",
  "events": [
    "tripStart",
    "tripEnd",
    "mil"
  ],
  "active": true
}
Send API Request
curl --request PUT \
  --url https://api.bouncie.dev/v1/webhooks/webhookId \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: application/json' \
  --data '{
  "name": "Example Webhook",
  "url": "https://www.exampleapp.com/webhook",
  "authKey": "9WVPxCzIUacIehyUKgJkqz4fQaZwnrs9DVy4yB",
  "events": [
    "tripStart",
    "tripEnd",
    "mil"
  ],
  "active": true
}'
{
  "id": "65f8a2b4c9d7e1234567890b",
  "name": "Example Webhook",
  "url": "https://www.exampleapp.com/webhook",
  "authKey": "9WVPxCzIUacIehyUKgJkqz4fQaZwnrs9DVy4yB",
  "applicationId": "65f8a2b4c9d7e1234567890c",
  "events": [
    "tripStart",
    "tripEnd"
  ],
  "active": true,
  "createdAt": "2026-01-01T08:30:00.000Z",
  "updatedAt": "2026-01-01T08:30:00.000Z"
}

Bouncie API


Delete Webhook
delete
https://api.bouncie.dev
/v1/webhooks/{webhookId}
Request
Path Parameters
webhookId
string
required
Match pattern:
^:webhookId$
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Responses
200
Returns the deleted webhook

Body

application/json

application/json
id
string
required
Unique identifier

Example:
65f8a2b4c9d7e1234567890b
name
string
required
Name of the webhook

Example:
Example Webhook
url
string
required
URL to send webhook events to

Example:
https://www.exampleapp.com/webhook
authKey
string
required
Authorization key to use for webhook source verification

Example:
9WVPxCzIUacIehyUKgJkqz4fQaZwnrs9DVy4yB
applicationId
string
required
Application ID that the webhook is associated with

Example:
65f8a2b4c9d7e1234567890c
events
array[string]
required
List of events that the webhook is subscribed to

Allowed values:
tripStart
tripData
tripEnd
tripMetrics
mil
battery
connect
disconnect
vinChange
userGeozone
applicationGeozone
Example:
["tripStart","tripEnd"]
active
boolean
required
Whether the webhook is active

Example:
true
createdAt
string<date-time>
required
Time the webhook was created

Example:
2026-01-01T08:30:00.000Z
updatedAt
string<date-time>
required
Time the webhook was last updated

Example:
2026-01-01T08:30:00.000Z
webhookId*
:
string
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
Send API Request
curl --request DELETE \
  --url https://api.bouncie.dev/v1/webhooks/webhookId \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: '
{
  "id": "65f8a2b4c9d7e1234567890b",
  "name": "Example Webhook",
  "url": "https://www.exampleapp.com/webhook",
  "authKey": "9WVPxCzIUacIehyUKgJkqz4fQaZwnrs9DVy4yB",
  "applicationId": "65f8a2b4c9d7e1234567890c",
  "events": [
    "tripStart",
    "tripEnd"
  ],
  "active": true,
  "createdAt": "2026-01-01T08:30:00.000Z",
  "updatedAt": "2026-01-01T08:30:00.000Z"
}

Bouncie API



Get Application Geo-Zone By ID
get
https://api.bouncie.dev
/v1/application-geozones/{applicationGeozoneId}
Request
Path Parameters
applicationGeozoneId
string
required
Match pattern:
^:applicationGeozoneId$
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Responses
200
Returns an application geozone

Body

application/json

application/json
id
string
required
Unique identifier

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890a
Match pattern:
[A-Za-z0-9]
imei
string
required
IMEI of the device that will trigger the webhook

>= 15 characters
<= 15 characters
Example:
123456789012345
Match pattern:
\d
events
array[string]
required
Events that will trigger a webhook

>= 1 items
<= 2 items
Allowed values:
ENTER
EXIT
Example:
["ENTER","EXIT"]
locationId
string
required
Unique identifier of the location to alert on

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890e
Match pattern:
[A-Za-z0-9]
scheduleId
string
Unique identifier of the schedule for when the geozone is active

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890f
Match pattern:
[A-Za-z0-9]
applicationGeozoneId*
:
string
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
Send API Request
curl --request GET \
  --url https://api.bouncie.dev/v1/application-geozones/applicationGeozoneId \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: '
{
  "id": "65f8a2b4c9d7e1234567890a",
  "imei": "123456789012345",
  "events": [
    "ENTER",
    "EXIT"
  ],
  "locationId": "65f8a2b4c9d7e1234567890e",
  "scheduleId": "65f8a2b4c9d7e1234567890f"
}

Bouncie API


Delete an Application Geo-Zone
delete
https://api.bouncie.dev
/v1/application-geozones/{applicationGeozoneId}
Request
Path Parameters
applicationGeozoneId
string
required
Match pattern:
^:applicationGeozoneId$
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Responses
204
Returns no content

Body

application/json

application/json
string or null
Allowed value:
null
applicationGeozoneId*
:
string
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
Send API Request
curl --request DELETE \
  --url https://api.bouncie.dev/v1/application-geozones/applicationGeozoneId \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: '
null

Bouncie API


Create an Application Geo-Zone
post
https://api.bouncie.dev
/v1/application-geozones/
Request
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Body

application/json

application/json
events
array[string]
required
Events that will trigger a webhook

>= 1 items
<= 2 items
Allowed values:
ENTER
EXIT
Example:
["ENTER","EXIT"]
imei
string
required
IMEI of the device that will trigger the webhook

>= 15 characters
<= 15 characters
Example:
123456789012345
Match pattern:
\d
locationId
string
required
Unique identifier of the location to alert on. See Create a Location

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890e
Match pattern:
[A-Za-z0-9]
scheduleId
string
Unique identifier of the schedule for when the geozone is active. See Create a Schedule

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890f
Match pattern:
[A-Za-z0-9]
Responses
201
Returns the created application geozone

Body

application/json

application/json
responses
/
201
id
string
required
Unique identifier

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890a
Match pattern:
[A-Za-z0-9]
imei
string
required
IMEI of the device that will trigger the webhook

>= 15 characters
<= 15 characters
Example:
123456789012345
Match pattern:
\d
events
array[string]
required
Events that will trigger a webhook

>= 1 items
<= 2 items
Allowed values:
ENTER
EXIT
Example:
["ENTER","EXIT"]
locationId
string
required
Unique identifier of the location to alert on

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890e
Match pattern:
[A-Za-z0-9]
scheduleId
string
Unique identifier of the schedule for when the geozone is active

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890f
Match pattern:
[A-Za-z0-9]
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
{
  "events": [
    "ENTER",
    "EXIT"
  ],
  "imei": "123456789012345",
  "locationId": "65f8a2b4c9d7e1234567890e",
  "scheduleId": "65f8a2b4c9d7e1234567890f"
}
{
  "events": [
    "ENTER",
    "EXIT"
  ],
  "imei": "123456789012345",
  "locationId": "65f8a2b4c9d7e1234567890e",
  "scheduleId": "65f8a2b4c9d7e1234567890f"
}
Send API Request
curl --request POST \
  --url https://api.bouncie.dev/v1/application-geozones/ \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: application/json' \
  --data '{
  "events": [
    "ENTER",
    "EXIT"
  ],
  "imei": "123456789012345",
  "locationId": "65f8a2b4c9d7e1234567890e",
  "scheduleId": "65f8a2b4c9d7e1234567890f"
}'
{
  "id": "65f8a2b4c9d7e1234567890a",
  "imei": "123456789012345",
  "events": [
    "ENTER",
    "EXIT"
  ],
  "locationId": "65f8a2b4c9d7e1234567890e",
  "scheduleId": "65f8a2b4c9d7e1234567890f"
}

Bouncie API

Get Location By ID
get
https://api.bouncie.dev
/v1/locations/{locationId}
Request
Path Parameters
locationId
string
required
Match pattern:
^:locationId$
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Responses
200
Returns a location

Body

application/json

application/json
location
PolygonPoint

one of: Polygon
required
A GeoJSON feature representation of the location which can either be a polygon or a point with a radius representing a circle

type
string
required
Type must be "Feature"

Allowed value:
Feature
geometry
object
required
The geometry representing the polygon

name
string
required
Name of the location

Example:
Home
id
string
required
Unique identifier of the location

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890e
Match pattern:
[A-Za-z0-9]
locationId*
:
string
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
Send API Request
curl --request GET \
  --url https://api.bouncie.dev/v1/locations/locationId \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: '
{
  "location": {
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            -96.7980123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7760432
          ]
        ]
      ]
    }
  },
  "name": "Home",
  "id": "65f8a2b4c9d7e1234567890e"
}

Bouncie API



Bouncie API
Endpoints
Webhooks
powered by Stoplight
Update a Location
put
https://api.bouncie.dev
/v1/locations/{locationId}
Request
Path Parameters
locationId
string
required
Match pattern:
^:locationId$
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Body

application/json

application/json
location
PolygonPoint

one of: Polygon
A GeoJSON feature representation of your location which can either be a polygon or a point with a radius representing a circleShow all...

type
string
required
Type must be "Feature"

Allowed value:
Feature
geometry
object
required
The geometry representing the polygon

name
string
Name of the location

Example:
Home
Responses
200
Returns the updated location

Body

application/json

application/json
responses
/
200
location
PolygonPoint

one of: Polygon
required
A GeoJSON feature representation of the location which can either be a polygon or a point with a radius representing a circle

type
string
required
Type must be "Feature"

Allowed value:
Feature
geometry
object
required
The geometry representing the polygon

name
string
required
Name of the location

Example:
Home
id
string
required
Unique identifier of the location

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890e
Match pattern:
[A-Za-z0-9]
locationId*
:
string
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
{
  "location": {
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            -96.7980123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7760432
          ]
        ]
      ]
    }
  },
  "name": "Home"
}
{
  "location": {
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            -96.7980123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7760432
          ]
        ]
      ]
    }
  },
  "name": "Home"
}
Send API Request
curl --request PUT \
  --url https://api.bouncie.dev/v1/locations/locationId \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: application/json' \
  --data '{
  "location": {
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            -96.7980123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7760432
          ]
        ]
      ]
    }
  },
  "name": "Home"
}'
{
  "location": {
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            -96.7980123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7760432
          ]
        ]
      ]
    }
  },
  "name": "Home",
  "id": "65f8a2b4c9d7e1234567890e"
}




Bouncie API
Endpoints
Webhooks
powered by Stoplight
Delete a Location
delete
https://api.bouncie.dev
/v1/locations/{locationId}
Request
Path Parameters
locationId
string
required
Match pattern:
^:locationId$
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Responses
204
404
Returns no content

Body

application/json

application/json
string or null
Allowed value:
null
locationId*
:
string
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
Send API Request
curl --request DELETE \
  --url https://api.bouncie.dev/v1/locations/locationId \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: '
null



Bouncie API
Endpoints
Webhooks
powered by Stoplight
Get Locations
get
https://api.bouncie.dev
/v1/locations/
Request
Query Parameters
id
string
Unique Identifier of the location

>= 24 characters
<= 24 characters
Match pattern:
[A-Za-z0-9]
name
string
Name of the location

Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Responses
200
400
Returns locations

Body

application/json

application/json
array of:
location
PolygonPoint

one of: Polygon
required
A GeoJSON feature representation of the location which can either be a polygon or a point with a radius representing a circle

type
string
required
Type must be "Feature"

Allowed value:
Feature
geometry
object
required
The geometry representing the polygon

name
string
required
Name of the location

Example:
Home
id
string
required
Unique identifier of the location

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890e
Match pattern:
[A-Za-z0-9]
id
:
string
name
:
string
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
Send API Request
curl --request GET \
  --url https://api.bouncie.dev/v1/locations/ \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: '
[
  {
    "location": {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              -96.7980123,
              32.7760432
            ],
            [
              -96.7960123,
              32.7760432
            ],
            [
              -96.7960123,
              32.7750432
            ],
            [
              -96.7980123,
              32.7750432
            ],
            [
              -96.7980123,
              32.7760432
            ]
          ]
        ]
      }
    },
    "name": "Home",
    "id": "65f8a2b4c9d7e1234567890e"
  }
]



Bouncie API
Endpoints
Webhooks
powered by Stoplight
Create a Location
post
https://api.bouncie.dev
/v1/locations/
Request
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Body

application/json

application/json
location
PolygonPoint

one of: Polygon
required
A GeoJSON feature representation of the location which can either be a polygon or a point with a radius representing a circle

type
string
required
Type must be "Feature"

Allowed value:
Feature
geometry
object
required
The geometry representing the polygon

name
string
required
Name of the location

Example:
Home
Responses
201
400
Returns the created location

Body

application/json

application/json
responses
/
201
location
PolygonPoint

one of: Polygon
required
A GeoJSON feature representation of the location which can either be a polygon or a point with a radius representing a circle

type
string
required
Type must be "Feature"

Allowed value:
Feature
geometry
object
required
The geometry representing the polygon

name
string
required
Name of the location

Example:
Home
id
string
required
Unique identifier of the location

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890e
Match pattern:
[A-Za-z0-9]
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
{
  "location": {
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            -96.7980123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7760432
          ]
        ]
      ]
    }
  },
  "name": "Home"
}
{
  "location": {
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            -96.7980123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7760432
          ]
        ]
      ]
    }
  },
  "name": "Home"
}
Send API Request
curl --request POST \
  --url https://api.bouncie.dev/v1/locations/ \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: application/json' \
  --data '{
  "location": {
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            -96.7980123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7760432
          ]
        ]
      ]
    }
  },
  "name": "Home"
}'
{
  "location": {
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            -96.7980123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7760432
          ]
        ]
      ]
    }
  },
  "name": "Home",
  "id": "65f8a2b4c9d7e1234567890e"
}




Bouncie API
Endpoints
Webhooks
powered by Stoplight
Get Schedule By ID
get
https://api.bouncie.dev
/v1/schedules/{scheduleId}
Request
Path Parameters
scheduleId
string
required
Match pattern:
^:scheduleId$
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Responses
200
404
Returns a schedule

Body

application/json

application/json
id
string
required
Unique identifier for the schedule

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890f
Match pattern:
[A-Za-z0-9]
name
string
required
Name of the schedule

Example:
Weekday Work Hours
referenceTz
string
required
Time zone identifier for the schedule

Example:
America/Chicago
schedule
array[object]
required
The different schedules that will trigger an event

>= 1 items
Example:
[{"daysOfWeek":[1,2,3,4,5],"times":[{"startTime":28800,"endTime":61200}]}]
daysOfWeek
array[integer]
required
Days of the week the schedule times are active where 0 represents Sunday and 6 represents Saturday.

>= 1 items
<= 7 items
Example:
[1,2,3,4,5]
times
array[object]
required
The time segments throughout the day represented in seconds that the schedule is active.

>= 1 items
Example:
[{"startTime":28800,"endTime":61200}]
scheduleId*
:
string
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
Send API Request
curl --request GET \
  --url https://api.bouncie.dev/v1/schedules/scheduleId \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: '
{
  "id": "65f8a2b4c9d7e1234567890f",
  "name": "Weekday Work Hours",
  "referenceTz": "America/Chicago",
  "schedule": [
    {
      "daysOfWeek": [
        1,
        2,
        3,
        4,
        5
      ],
      "times": [
        {
          "startTime": 28800,
          "endTime": 61200
        }
      ]
    }
  ]
}



Bouncie API
Endpoints
Webhooks
powered by Stoplight
Update a Schedule
put
https://api.bouncie.dev
/v1/schedules/{scheduleId}
Request
Path Parameters
scheduleId
string
required
Match pattern:
^:scheduleId$
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Body

application/json

application/json
name
string
Name of the schedule

Example:
Weekday Work Hours
referenceTz
string
Time zone identifier for the schedule

Example:
America/Chicago
schedule
array[object]
The different schedules that will trigger an event

>= 1 items
Example:
[{"daysOfWeek":[1,2,3,4,5],"times":[{"startTime":28800,"endTime":61200}]}]
daysOfWeek
array[integer]
required
Days of the week the schedule times are active where 0 represents Sunday and 6 represents Saturday.

>= 1 items
<= 7 items
Example:
[1,2,3,4,5]
times
array[object]
required
The time segments throughout the day represented in seconds that the schedule is active.

>= 1 items
Example:
[{"startTime":28800,"endTime":61200}]
Responses
200
400
404
Returns the updated schedule

Body

application/json

application/json
responses
/
200
id
string
required
Unique identifier for the schedule

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890f
Match pattern:
[A-Za-z0-9]
name
string
required
Name of the schedule

Example:
Weekday Work Hours
referenceTz
string
required
Time zone identifier for the schedule

Example:
America/Chicago
schedule
array[object]
required
The different schedules that will trigger an event

>= 1 items
Example:
[{"daysOfWeek":[1,2,3,4,5],"times":[{"startTime":28800,"endTime":61200}]}]
daysOfWeek
array[integer]
required
Days of the week the schedule times are active where 0 represents Sunday and 6 represents Saturday.

>= 1 items
<= 7 items
Example:
[1,2,3,4,5]
times
array[object]
required
The time segments throughout the day represented in seconds that the schedule is active.

>= 1 items
Example:
[{"startTime":28800,"endTime":61200}]
scheduleId*
:
string
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
{
  "name": "Weekday Work Hours",
  "referenceTz": "America/Chicago",
  "schedule": [
    {
      "daysOfWeek": [
        1,
        2,
        3,
        4,
        5
      ],
      "times": [
        {
          "startTime": 28800,
          "endTime": 61200
        }
      ]
    }
  ]
}
{
  "name": "Weekday Work Hours",
  "referenceTz": "America/Chicago",
  "schedule": [
    {
      "daysOfWeek": [
        1,
        2,
        3,
        4,
        5
      ],
      "times": [
        {
          "startTime": 28800,
          "endTime": 61200
        }
      ]
    }
  ]
}
Send API Request
curl --request PUT \
  --url https://api.bouncie.dev/v1/schedules/scheduleId \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: application/json' \
  --data '{
  "name": "Weekday Work Hours",
  "referenceTz": "America/Chicago",
  "schedule": [
    {
      "daysOfWeek": [
        1,
        2,
        3,
        4,
        5
      ],
      "times": [
        {
          "startTime": 28800,
          "endTime": 61200
        }
      ]
    }
  ]
}'
{
  "id": "65f8a2b4c9d7e1234567890f",
  "name": "Weekday Work Hours",
  "referenceTz": "America/Chicago",
  "schedule": [
    {
      "daysOfWeek": [
        1,
        2,
        3,
        4,
        5
      ],
      "times": [
        {
          "startTime": 28800,
          "endTime": 61200
        }
      ]
    }
  ]
}



Bouncie API
Endpoints
Webhooks
powered by Stoplight
Delete a schedule
delete
https://api.bouncie.dev
/v1/schedules/{scheduleId}
Request
Path Parameters
scheduleId
string
required
Match pattern:
^:scheduleId$
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Responses
204
404
Returns no content

Body

application/json

application/json
string or null
Allowed value:
null
scheduleId*
:
string
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
Send API Request
curl --request DELETE \
  --url https://api.bouncie.dev/v1/schedules/scheduleId \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: '
null




Bouncie API
Endpoints
Webhooks
powered by Stoplight
Get Schedules
get
https://api.bouncie.dev
/v1/schedules/
Request
Query Parameters
id
string
Unique ID of the schedule

>= 24 characters
<= 24 characters
Match pattern:
[A-Za-z0-9]
name
string
Name of the schedule

Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Responses
200
400
Returns schedules

Body

application/json

application/json
array of:
id
string
required
Unique identifier for the schedule

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890f
Match pattern:
[A-Za-z0-9]
name
string
required
Name of the schedule

Example:
Weekday Work Hours
referenceTz
string
required
Time zone identifier for the schedule

Example:
America/Chicago
schedule
array[object]
required
The different schedules that will trigger an event

>= 1 items
Example:
[{"daysOfWeek":[1,2,3,4,5],"times":[{"startTime":28800,"endTime":61200}]}]
daysOfWeek
array[integer]
required
Days of the week the schedule times are active where 0 represents Sunday and 6 represents Saturday.

>= 1 items
<= 7 items
Example:
[1,2,3,4,5]
times
array[object]
required
The time segments throughout the day represented in seconds that the schedule is active.

>= 1 items
Example:
[{"startTime":28800,"endTime":61200}]
id
:
string
name
:
string
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
Send API Request
curl --request GET \
  --url https://api.bouncie.dev/v1/schedules/ \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: '
[
  {
    "id": "65f8a2b4c9d7e1234567890f",
    "name": "Weekday Work Hours",
    "referenceTz": "America/Chicago",
    "schedule": [
      {
        "daysOfWeek": [
          1,
          2,
          3,
          4,
          5
        ],
        "times": [
          {
            "startTime": 28800,
            "endTime": 61200
          }
        ]
      }
    ]
  }
]



Bouncie API
Endpoints
Webhooks
powered by Stoplight
Create a Schedule
post
https://api.bouncie.dev
/v1/schedules/
Request
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Body

application/json

application/json
name
string
required
Name of the schedule

Example:
Weekday Work Hours
referenceTz
string
required
Time zone identifier for the schedule

Example:
America/Chicago
schedule
array[object]
required
The different schedules that will trigger an event

>= 1 items
Example:
[{"daysOfWeek":[1,2,3,4,5],"times":[{"startTime":28800,"endTime":61200}]}]
daysOfWeek
array[integer]
required
Days of the week the schedule times are active where 0 represents Sunday and 6 represents Saturday.

>= 1 items
<= 7 items
Example:
[1,2,3,4,5]
times
array[object]
required
The time segments throughout the day represented in seconds that the schedule is active.

>= 1 items
Example:
[{"startTime":28800,"endTime":61200}]
Responses
201
400
Returns the created schedule

Body

application/json

application/json
responses
/
201
id
string
required
Unique identifier for the schedule

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890f
Match pattern:
[A-Za-z0-9]
name
string
required
Name of the schedule

Example:
Weekday Work Hours
referenceTz
string
required
Time zone identifier for the schedule

Example:
America/Chicago
schedule
array[object]
required
The different schedules that will trigger an event

>= 1 items
Example:
[{"daysOfWeek":[1,2,3,4,5],"times":[{"startTime":28800,"endTime":61200}]}]
daysOfWeek
array[integer]
required
Days of the week the schedule times are active where 0 represents Sunday and 6 represents Saturday.

>= 1 items
<= 7 items
Example:
[1,2,3,4,5]
times
array[object]
required
The time segments throughout the day represented in seconds that the schedule is active.

>= 1 items
Example:
[{"startTime":28800,"endTime":61200}]
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
{
  "name": "Weekday Work Hours",
  "referenceTz": "America/Chicago",
  "schedule": [
    {
      "daysOfWeek": [
        1,
        2,
        3,
        4,
        5
      ],
      "times": [
        {
          "startTime": 28800,
          "endTime": 61200
        }
      ]
    }
  ]
}
{
  "name": "Weekday Work Hours",
  "referenceTz": "America/Chicago",
  "schedule": [
    {
      "daysOfWeek": [
        1,
        2,
        3,
        4,
        5
      ],
      "times": [
        {
          "startTime": 28800,
          "endTime": 61200
        }
      ]
    }
  ]
}
Send API Request
curl --request POST \
  --url https://api.bouncie.dev/v1/schedules/ \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: application/json' \
  --data '{
  "name": "Weekday Work Hours",
  "referenceTz": "America/Chicago",
  "schedule": [
    {
      "daysOfWeek": [
        1,
        2,
        3,
        4,
        5
      ],
      "times": [
        {
          "startTime": 28800,
          "endTime": 61200
        }
      ]
    }
  ]
}'
{
  "id": "65f8a2b4c9d7e1234567890f",
  "name": "Weekday Work Hours",
  "referenceTz": "America/Chicago",
  "schedule": [
    {
      "daysOfWeek": [
        1,
        2,
        3,
        4,
        5
      ],
      "times": [
        {
          "startTime": 28800,
          "endTime": 61200
        }
      ]
    }
  ]
}



Bouncie API
Endpoints
Webhooks
powered by Stoplight
Get User Geo-Zone By ID
get
https://api.bouncie.dev
/v1/user-geozones/{userGeozoneId}
Request
Path Parameters
userGeozoneId
string
required
Match pattern:
^:userGeozoneId$
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Responses
200
404
Returns a user geozone

Body

application/json

application/json
id
string
required
Unique identifier

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890a
Match pattern:
[A-Za-z0-9]
imei
string
required
IMEI of the device that will trigger the webhook

>= 15 characters
<= 15 characters
Example:
123456789101112
Match pattern:
\d
location
PolygonPoint

one of: Polygon
required
A GeoJSON feature representation of the location which can either be a polygon or a point with a radius representing a circle

type
string
required
Type must be "Feature"

Allowed value:
Feature
geometry
object
required
The geometry representing the polygon

schedule
array[object]
required
Example:
[{"daysOfWeek":[1,2,3,4,5],"times":[{"startTime":28800,"endTime":61200}]}]
daysOfWeek
array[integer]
required
Days of the week the schedule times are active where 0 represents Sunday and 6 represents Saturday.

>= 1 items
<= 7 items
Example:
[1,2,3,4,5]
times
array[object]
required
The time segments throughout the day represented in seconds that the schedule is active.

>= 1 items
Example:
[{"startTime":28800,"endTime":61200}]
userGeozoneId*
:
string
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
Send API Request
curl --request GET \
  --url https://api.bouncie.dev/v1/user-geozones/userGeozoneId \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: '
{
  "id": "65f8a2b4c9d7e1234567890a",
  "imei": "123456789101112",
  "location": {
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            -96.7980123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7760432
          ],
          [
            -96.7960123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7750432
          ],
          [
            -96.7980123,
            32.7760432
          ]
        ]
      ]
    }
  },
  "schedule": [
    {
      "daysOfWeek": [
        1,
        2,
        3,
        4,
        5
      ],
      "times": [
        {
          "startTime": 28800,
          "endTime": 61200
        }
      ]
    }
  ]
}




Bouncie API
Endpoints
Webhooks
powered by Stoplight
Get User Geo-Zones
get
https://api.bouncie.dev
/v1/user-geozones/
Request
Query Parameters
imei
string
IMEI of the device that will trigger the webhook

>= 15 characters
<= 15 characters
Match pattern:
\d
Headers
Authorization
string
User access token

Content-Type
string
Allowed value:
application/json
Responses
200
400
Returns user geozones

Body

application/json

application/json
array of:
id
string
required
Unique identifier

>= 24 characters
<= 24 characters
Example:
65f8a2b4c9d7e1234567890a
Match pattern:
[A-Za-z0-9]
imei
string
required
IMEI of the device that will trigger the webhook

>= 15 characters
<= 15 characters
Example:
123456789101112
Match pattern:
\d
location
PolygonPoint

one of: Polygon
required
A GeoJSON feature representation of the location which can either be a polygon or a point with a radius representing a circle

type
string
required
Type must be "Feature"

Allowed value:
Feature
geometry
object
required
The geometry representing the polygon

schedule
array[object]
required
Example:
[{"daysOfWeek":[1,2,3,4,5],"times":[{"startTime":28800,"endTime":61200}]}]
daysOfWeek
array[integer]
required
Days of the week the schedule times are active where 0 represents Sunday and 6 represents Saturday.

>= 1 items
<= 7 items
Example:
[1,2,3,4,5]
times
array[object]
required
The time segments throughout the day represented in seconds that the schedule is active.

>= 1 items
Example:
[{"startTime":28800,"endTime":61200}]
imei
:
string
Authorization
:
string
Content-Type
:
Not Setapplication/json

select an option
Send API Request
curl --request GET \
  --url https://api.bouncie.dev/v1/user-geozones/ \
  --header 'Accept: application/json' \
  --header 'Authorization: ' \
  --header 'Content-Type: '
[
  {
    "id": "65f8a2b4c9d7e1234567890a",
    "imei": "123456789101112",
    "location": {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              -96.7980123,
              32.7760432
            ],
            [
              -96.7960123,
              32.7760432
            ],
            [
              -96.7960123,
              32.7750432
            ],
            [
              -96.7980123,
              32.7750432
            ],
            [
              -96.7980123,
              32.7760432
            ]
          ]
        ]
      }
    },
    "schedule": [
      {
        "daysOfWeek": [
          1,
          2,
          3,
          4,
          5
        ],
        "times": [
          {
            "startTime": 28800,
            "endTime": 61200
          }
        ]
      }
    ]
  }
]





Bouncie API
Endpoints
Webhooks
powered by Stoplight
Device Connect
post
deviceConnect
Request
Body

application/json

application/json
eventType
string
required
Event type

Allowed value:
connect
imei
string
required
IMEI of the device that sent the event

Example:
123456789012345
vin
string
required
VIN of the vehicle that sent the event

Example:
1HGBIQOJXMN109186
connect
object
required
Event data

timestamp
string<date-time>
required
Timestamp of the event

Example:
2026-01-01T08:30:00.000Z
timeZone
string
required
Timezone of the event

Example:
America/Chicago
latitude
number
required
Latitude of the event

Example:
32.7767432
longitude
number
required
Longitude of the event

Example:
-96.7970123
{
  "eventType": "connect",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "connect": {
    "timestamp": "2026-01-01T08:30:00.000Z",
    "timeZone": "America/Chicago",
    "latitude": 32.7767432,
    "longitude": -96.7970123
  }
}
{
  "eventType": "connect",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "connect": {
    "timestamp": "2026-01-01T08:30:00.000Z",
    "timeZone": "America/Chicago",
    "latitude": 32.7767432,
    "longitude": -96.7970123
  }
}






Bouncie API
Endpoints
Webhooks
powered by Stoplight
Device Disconnect
post
deviceDisconnect
Handling Device Disconnect Events
Bouncie devices generate Device Disconnect events when power to the device is removed — typically due to an unplug or tamper incident. These events notify developers that the device has lost external power, either intentionally or unexpectedly.

Why Multiple Disconnect Events Occur
Immediate Disconnect (Real-Time Notification): The latest generation of Bouncie devices can transmit an immediate disconnect notification when power is removed, provided that network conditions allow. This enables real-time awareness of unplug or tamper events.
Deferred Disconnect (Post-Reconnection Notification): When network connectivity is unavailable at the moment of power loss, the device records the disconnect locally. Once power is restored and the device reconnects to the network, it transmits the stored disconnect event.
Because of this dual-reporting mechanism, developers may observe two Device Disconnect events for a single unplug or tamper incident:

One generated immediately when power is lost (if conditions allow)
One generated after power restoration and reconnection
Best Practices
Treat multiple disconnect events as notifications of the same underlying unplug or tamper event and handle them gracefully within your application.
Request
Body

application/json

application/json
eventType
string
required
Event type

Allowed value:
disconnect
imei
string
required
IMEI of the device that sent the event

Example:
123456789012345
vin
string
required
VIN of the vehicle that sent the event

Example:
1HGBIQOJXMN109186
disconnect
object
required
Event data

timestamp
string<date-time>
required
Timestamp of the event

Example:
2026-01-01T08:30:00.000Z
timeZone
string
required
Timezone of the event

Example:
America/Chicago
latitude
number
required
Latitude of the event

Example:
32.7767432
longitude
number
required
Longitude of the event

Example:
-96.7970123
{
  "eventType": "disconnect",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "disconnect": {
    "timestamp": "2026-01-01T08:30:00.000Z",
    "timeZone": "America/Chicago",
    "latitude": 32.7767432,
    "longitude": -96.7970123
  }
}
{
  "eventType": "disconnect",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "disconnect": {
    "timestamp": "2026-01-01T08:30:00.000Z",
    "timeZone": "America/Chicago",
    "latitude": 32.7767432,
    "longitude": -96.7970123
  }
}




Bouncie API
Endpoints
Webhooks
powered by Stoplight
Battery
post
battery
Request
Body

application/json

application/json
eventType
string
required
Event type

Allowed value:
battery
imei
string
required
IMEI of the device that sent the event

Example:
123456789012345
vin
string
required
VIN of the vehicle that sent the event

Example:
1HGBIQOJXMN109186
battery
object
required
Event data

timestamp
string<date-time>
required
Timestamp of the event

Example:
2026-01-01T08:30:00.000Z
value
string
required
One of: normal, low, or `critical

Allowed values:
normal
low
critical
{
  "eventType": "battery",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "battery": {
    "timestamp": "2026-01-01T08:30:00.000Z",
    "value": "normal"
  }
}
{
  "eventType": "battery",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "battery": {
    "timestamp": "2026-01-01T08:30:00.000Z",
    "value": "normal"
  }
}



Bouncie API
Endpoints
Webhooks
powered by Stoplight
MIL
post
mil
Request
Body

application/json

application/json
eventType
string
required
Event type

Allowed value:
mil
imei
string
required
IMEI of the device that sent the event

Example:
123456789012345
vin
string
required
VIN of the vehicle that sent the event

Example:
1HGBIQOJXMN109186
mil
object
required
Event data

timestamp
string<date-time>
required
Timestamp of the event

Example:
2026-01-01T08:30:00.000Z
value
string
required
Whether the MIL is on

Allowed value:
ON
codes
string
required
Diagnostic Trouble Codes (DTCs) for the vehicle

Example:
P0420
{
  "eventType": "mil",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "mil": {
    "timestamp": "2026-01-01T08:30:00.000Z",
    "value": "ON",
    "codes": "P0420"
  }
}
{
  "eventType": "mil",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "mil": {
    "timestamp": "2026-01-01T08:30:00.000Z",
    "value": "ON",
    "codes": "P0420"
  }
}





Bouncie API
Endpoints
Webhooks
powered by Stoplight
Vin Change
post
vinChange
Request
Body

application/json

application/json
eventType
string
required
Event type

Allowed value:
vinChange
imei
string
required
IMEI of the device that sent the event

Example:
123456789012345
vin
string
required
VIN of the vehicle that sent the event

Example:
2FTQX09L0XCA12345
vinChange
object
required
Event data

timestamp
string<date-time>
required
Timestamp of the event

Example:
2026-01-01T08:30:00.000Z
timeZone
string
required
Timezone of the event

Example:
America/Chicago
oldVin
string or null
required
The VIN that the device had previously been reporting

Example:
1HGBIQOJXMN109186
newVin
string
required
The VIN that the device has detected and is now reporting

Example:
2FTQX09L0XCA12345
{
  "eventType": "vinChange",
  "imei": "123456789012345",
  "vin": "2FTQX09L0XCA12345",
  "vinChange": {
    "timestamp": "2026-01-01T08:30:00.000Z",
    "timeZone": "America/Chicago",
    "oldVin": "1HGBIQOJXMN109186",
    "newVin": "2FTQX09L0XCA12345"
  }
}
{
  "eventType": "vinChange",
  "imei": "123456789012345",
  "vin": "2FTQX09L0XCA12345",
  "vinChange": {
    "timestamp": "2026-01-01T08:30:00.000Z",
    "timeZone": "America/Chicago",
    "oldVin": "1HGBIQOJXMN109186",
    "newVin": "2FTQX09L0XCA12345"
  }
}




Bouncie API
Endpoints
Webhooks
powered by Stoplight
Trip Start
post
tripStart
Handling Message Data Duplication
Bouncie communicates data through multiple streams to ensure both robust and timely reception of vehicle metrics. This includes periodic data transmissions that ensure reliable transmission of data and real-time data transmission for immediate updates. Due to this multi-stream approach, developers might observe instances of message data duplication.

Why Duplication Occurs
Real-Time Stream: Designed for speed, this stream delivers data as it happens without waiting for previous messages to be confirmed. This will lead to data points that can overlap when paired with the regular transmissions from the Periodic Data stream.
Periodic Stream: Designed to ensure data integrity and order, this stream delivers data at regular intervals. As this data will overlap with the data received via the Real-Time Stream, some information will be replicated.
Best Practices for Handling Duplications
Unique Identifiers (transactionId): Each trip is associated with a transactionId serving as its unique identifier. We recommend implementing logic in your application to check for and discard any duplicated events based on these transactionId values.
Timestamp Analysis: Utilize timestamps to determine the relevancy of data. In some cases, slightly older data received via the Periodic Stream might still be valuable for confirming the accuracy of data captured through the Real-Time Stream. In addition, there are circumstances in which the Periodic Data Stream may contain data that was unable to be transmitted via the Real-Time Stream.
By implementing these practices, developers can efficiently manage data duplication, ensuring the integrity and accuracy of the data processed in their applications. We're committed to providing a high-quality data stream to power your vehicle telematics solutions.

Request
Body

application/json

application/json
eventType
string
required
Event type

Allowed value:
tripStart
imei
string
required
IMEI of the device that sent the event

Example:
123456789012345
vin
string
required
VIN of the vehicle that sent the event

Example:
1HGBIQOJXMN109186
transactionId
string
required
Unique identifier for the trip

Example:
123456789012345-1735920000-202501
start
object
required
Event data

timestamp
string<date-time>
required
Timestamp of the event

Example:
2026-01-01T010:01:00.000Z
timeZone
string
required
Timezone of the event

Example:
America/Chicago
odometer
number
required
Odometer reading at the start of the trip

Example:
45678.9
{
  "eventType": "tripStart",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "transactionId": "123456789012345-1735920000-202501",
  "start": {
    "timestamp": "2026-01-01T010:01:00.000Z",
    "timeZone": "America/Chicago",
    "odometer": 45678.9
  }
}
{
  "eventType": "tripStart",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "transactionId": "123456789012345-1735920000-202501",
  "start": {
    "timestamp": "2026-01-01T010:01:00.000Z",
    "timeZone": "America/Chicago",
    "odometer": 45678.9
  }
}





Bouncie API
Endpoints
Webhooks
powered by Stoplight
Trip Data
post
tripData
Handling Message Data Duplication
Bouncie communicates data through multiple streams to ensure both robust and timely reception of vehicle metrics. This includes periodic data transmissions that ensure reliable transmission of data and real-time data transmission for immediate updates. Due to this multi-stream approach, developers might observe instances of message data duplication.

Why Duplication Occurs
Real-Time Stream: Designed for speed, this stream delivers data as it happens without waiting for previous messages to be confirmed. This will lead to data points that can overlap when paired with the regular transmissions from the Periodic Data stream.
Periodic Stream: Designed to ensure data integrity and order, this stream delivers data at regular intervals. As this data will overlap with the data received via the Real-Time Stream, some information will be replicated.
Best Practices for Handling Duplications
Unique Identifiers (transactionId): Each trip is associated with a transactionId serving as its unique identifier. We recommend implementing logic in your application to check for and discard any duplicated events based on these transactionId values.
Timestamp Analysis: Utilize timestamps to determine the relevancy of data. In some cases, slightly older data received via the Periodic Stream might still be valuable for confirming the accuracy of data captured through the Real-Time Stream. In addition, there are circumstances in which the Periodic Data Stream may contain data that was unable to be transmitted via the Real-Time Stream.
By implementing these practices, developers can efficiently manage data duplication, ensuring the integrity and accuracy of the data processed in their applications. We're committed to providing a high-quality data stream to power your vehicle telematics solutions.

Request
Body

application/json

application/json
eventType
string
required
Event type

Allowed value:
tripData
imei
string
required
IMEI of the device that sent the event

Example:
123456789012345
vin
string
required
VIN of the vehicle that sent the event

Example:
1HGBIQOJXMN109186
transactionId
string
required
Unique identifier for the trip

Example:
123456789012345-1735920000-202501
data
array[object]
required
Event data

timestamp
string<date-time>
required
Timestamp of the event

Example:
2026-01-01T010:01:00.000Z
speed
number
Speed of the vehicle in MPH

Example:
45
gps
object
required
GPS data

fuelLevelInput
number
Fuel level input

Example:
75.5
{
  "eventType": "tripData",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "transactionId": "123456789012345-1735920000-202501",
  "data": [
    {
      "timestamp": "2026-01-01T010:01:00.000Z",
      "speed": 45,
      "gps": {
        "lat": 32.7767432,
        "lon": -96.7970123,
        "heading": 135
      },
      "fuelLevelInput": 75.5
    }
  ]
}
{
  "eventType": "tripData",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "transactionId": "123456789012345-1735920000-202501",
  "data": [
    {
      "timestamp": "2026-01-01T010:01:00.000Z",
      "speed": 45,
      "gps": {
        "lat": 32.7767432,
        "lon": -96.7970123,
        "heading": 135
      },
      "fuelLevelInput": 75.5
    }
  ]
}






Bouncie API
Endpoints
Webhooks
powered by Stoplight
Trip Metrics
post
tripMetrics
Handling Message Data Duplication
Bouncie communicates data through multiple streams to ensure both robust and timely reception of vehicle metrics. This includes periodic data transmissions that ensure reliable transmission of data and real-time data transmission for immediate updates. Due to this multi-stream approach, developers might observe instances of message data duplication.

Why Duplication Occurs
Real-Time Stream: Designed for speed, this stream delivers data as it happens without waiting for previous messages to be confirmed. This will lead to data points that can overlap when paired with the regular transmissions from the Periodic Data stream.
Periodic Stream: Designed to ensure data integrity and order, this stream delivers data at regular intervals. As this data will overlap with the data received via the Real-Time Stream, some information will be replicated.
Best Practices for Handling Duplications
Unique Identifiers (transactionId): Each trip is associated with a transactionId serving as its unique identifier. We recommend implementing logic in your application to check for and discard any duplicated events based on these transactionId values.
Timestamp Analysis: Utilize timestamps to determine the relevancy of data. In some cases, slightly older data received via the Periodic Stream might still be valuable for confirming the accuracy of data captured through the Real-Time Stream. In addition, there are circumstances in which the Periodic Data Stream may contain data that was unable to be transmitted via the Real-Time Stream.
By implementing these practices, developers can efficiently manage data duplication, ensuring the integrity and accuracy of the data processed in their applications. We're committed to providing a high-quality data stream to power your vehicle telematics solutions.

Request
Body

application/json

application/json
eventType
string
required
Event type

Allowed value:
tripMetrics
imei
string
required
IMEI of the device that sent the event

Example:
123456789012345
vin
string
required
VIN of the vehicle that sent the event

Example:
1HGBIQOJXMN109186
transactionId
string
required
Unique identifier for the trip

Example:
123456789012345-1735920000-202501
metrics
object
required
Event data

timestamp
string<date-time>
required
Timestamp of the event

Example:
2026-01-01T010:01:00.000Z
tripTime
number
required
Duration of the trip in seconds

Example:
1800
tripDistance
number
required
Distance travelled in miles

Example:
12.5
totalIdlingTime
number
required
Total time spent idling in seconds

Example:
300
maxSpeed
number
required
Maximum speed in MPH

Example:
65
averageDriveSpeed
number
required
Average driving speed in MPH

Example:
35.5
hardBrakingCounts
number
required
Number of hard braking events

Example:
2
hardAccelerationCounts
number
required
Number of hard acceleration events

Example:
1
{
  "eventType": "tripMetrics",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "transactionId": "123456789012345-1735920000-202501",
  "metrics": {
    "timestamp": "2026-01-01T010:01:00.000Z",
    "tripTime": 1800,
    "tripDistance": 12.5,
    "totalIdlingTime": 300,
    "maxSpeed": 65,
    "averageDriveSpeed": 35.5,
    "hardBrakingCounts": 2,
    "hardAccelerationCounts": 1
  }
}
{
  "eventType": "tripMetrics",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "transactionId": "123456789012345-1735920000-202501",
  "metrics": {
    "timestamp": "2026-01-01T010:01:00.000Z",
    "tripTime": 1800,
    "tripDistance": 12.5,
    "totalIdlingTime": 300,
    "maxSpeed": 65,
    "averageDriveSpeed": 35.5,
    "hardBrakingCounts": 2,
    "hardAccelerationCounts": 1
  }
}





Bouncie API
Endpoints
Webhooks
powered by Stoplight
Trip End
post
tripEnd
Handling Message Data Duplication
Bouncie communicates data through multiple streams to ensure both robust and timely reception of vehicle metrics. This includes periodic data transmissions that ensure reliable transmission of data and real-time data transmission for immediate updates. Due to this multi-stream approach, developers might observe instances of message data duplication.

Why Duplication Occurs
Real-Time Stream: Designed for speed, this stream delivers data as it happens without waiting for previous messages to be confirmed. This will lead to data points that can overlap when paired with the regular transmissions from the Periodic Data stream.
Periodic Stream: Designed to ensure data integrity and order, this stream delivers data at regular intervals. As this data will overlap with the data received via the Real-Time Stream, some information will be replicated.
Best Practices for Handling Duplications
Unique Identifiers (transactionId): Each trip is associated with a transactionId serving as its unique identifier. We recommend implementing logic in your application to check for and discard any duplicated events based on these transactionId values.
Timestamp Analysis: Utilize timestamps to determine the relevancy of data. In some cases, slightly older data received via the Periodic Stream might still be valuable for confirming the accuracy of data captured through the Real-Time Stream. In addition, there are circumstances in which the Periodic Data Stream may contain data that was unable to be transmitted via the Real-Time Stream.
By implementing these practices, developers can efficiently manage data duplication, ensuring the integrity and accuracy of the data processed in their applications. We're committed to providing a high-quality data stream to power your vehicle telematics solutions.

Request
Body

application/json

application/json
eventType
string
required
Event type

Allowed value:
tripEnd
imei
string
required
IMEI of the device that sent the event

Example:
123456789012345
vin
string
required
VIN of the vehicle that sent the event

Example:
1HGBIQOJXMN109186
transactionId
string
required
Unique identifier for the trip

Example:
123456789012345-1735920000-202501
end
object
required
Event data

timestamp
string<date-time>
required
Timestamp of the event

Example:
2026-01-01T10:32:00.000Z
timeZone
string
required
Timezone of the event

Example:
America/Chicago
odometer
number
required
Odometer reading at the end of the trip

Example:
45691.4
fuelConsumed
number
required
Amount of fuel consumed in gallons

Example:
0.8
{
  "eventType": "tripEnd",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "transactionId": "123456789012345-1735920000-202501",
  "end": {
    "timestamp": "2026-01-01T10:32:00.000Z",
    "timeZone": "America/Chicago",
    "odometer": 45691.4,
    "fuelConsumed": 0.8
  }
}
{
  "eventType": "tripEnd",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "transactionId": "123456789012345-1735920000-202501",
  "end": {
    "timestamp": "2026-01-01T10:32:00.000Z",
    "timeZone": "America/Chicago",
    "odometer": 45691.4,
    "fuelConsumed": 0.8
  }
}



Bouncie API
Endpoints
Webhooks
powered by Stoplight
Application Geo-Zone
post
applicationGeozone
Request
Body

application/json

application/json
eventType
string
required
Event type

Allowed value:
applicationGeozone
imei
string
required
IMEI of the device that sent the event

Example:
123456789012345
vin
string
required
VIN of the vehicle that sent the event

Example:
1HGBIQOJXMN109186
transactionId
string
required
Unique identifier for the trip

Example:
123456789012345-1735920000-202501
geozone
object
required
id
string
required
Unique identifier for the location that triggered the webhook

Example:
65f8a2b4c9d7e1234567890a
name
string
required
The name of the location that triggered the webhook

Example:
Home
event
string
required
The events that triggered the webhook

Allowed values:
ENTER
EXIT
Example:
ENTER
timestamp
string<date-time>
required
Timestamp of the event

Example:
2026-01-01T08:30:00.000Z
location
object
required
{
  "eventType": "applicationGeozone",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "transactionId": "123456789012345-1735920000-202501",
  "geozone": {
    "id": "65f8a2b4c9d7e1234567890a",
    "name": "Home",
    "event": "ENTER",
    "timestamp": "2026-01-01T08:30:00.000Z",
    "location": {
      "lat": 32.7767432,
      "lon": -96.7970123,
      "heading": 135
    }
  }
}
{
  "eventType": "applicationGeozone",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "transactionId": "123456789012345-1735920000-202501",
  "geozone": {
    "id": "65f8a2b4c9d7e1234567890a",
    "name": "Home",
    "event": "ENTER",
    "timestamp": "2026-01-01T08:30:00.000Z",
    "location": {
      "lat": 32.7767432,
      "lon": -96.7970123,
      "heading": 135
    }
  }
}




Bouncie API
Endpoints
Webhooks
powered by Stoplight
User Geo-Zone
post
userGeozone
Request
Body

application/json

application/json
eventType
string
required
Event type

Allowed value:
userGeozone
imei
string
required
IMEI of the device that sent the event

Example:
123456789012345
vin
string
required
VIN of the vehicle that sent the event

Example:
1HGBIQOJXMN109186
transactionId
string
required
Unique identifier for the trip

Example:
123456789012345-1735920000-202501
geozone
object
required
id
string
required
Unique identifier for the location that triggered the webhook

Example:
65f8a2b4c9d7e1234567890a
name
string
required
The name of the location that triggered the webhook

Example:
Home
event
string
required
The events that triggered the webhook

Allowed values:
ENTER
EXIT
Example:
ENTER
timestamp
string<date-time>
required
Timestamp of the event

Example:
2026-01-01T08:30:00.000Z
location
object
required
{
  "eventType": "userGeozone",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "transactionId": "123456789012345-1735920000-202501",
  "geozone": {
    "id": "65f8a2b4c9d7e1234567890a",
    "name": "Home",
    "event": "ENTER",
    "timestamp": "2026-01-01T08:30:00.000Z",
    "location": {
      "lat": 32.7767432,
      "lon": -96.7970123,
      "heading": 135
    }
  }
}
{
  "eventType": "userGeozone",
  "imei": "123456789012345",
  "vin": "1HGBIQOJXMN109186",
  "transactionId": "123456789012345-1735920000-202501",
  "geozone": {
    "id": "65f8a2b4c9d7e1234567890a",
    "name": "Home",
    "event": "ENTER",
    "timestamp": "2026-01-01T08:30:00.000Z",
    "location": {
      "lat": 32.7767432,
      "lon": -96.7970123,
      "heading": 135
    }
  }
}












