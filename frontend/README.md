# Two Hearts Chat

MVP Prompt — Private 2-Person Chat Website
BUILD ONLY FRONTEND

Build a production-ready MVP web application for private 1-to-1 chatting between exactly two users.

The application should be simple, secure, responsive, and deployable to the cloud.

1. Core Concept

Create a private chat website where only two authorized users can log in and communicate with each other.

There should be:

Login page

Username/email + password authentication

Secure password hashing

Private chat interface

Real-time or near-real-time messaging

Cloud database

Persistent chat history

Maximum chat history of 50 lakh (5,000,000) messages

Responsive design for desktop and mobile

Do NOT build group chats, public rooms, social feeds, or user discovery.

The MVP is strictly:

User A ↔ User B

2. Recommended Tech Stack

Use:

Frontend

Next.js

React

TypeScript

Tailwind CSS

Backend

Use Next.js API routes/server actions OR a clean Node.js backend.

Database

Prefer:

MongoDB Atlas

because chat messages are simple, high-volume documents and MongoDB provides straightforward horizontal scaling.

If MySQL is significantly easier for the chosen architecture, MySQL 8+ can be used instead.

Authentication

Implement secure session-based authentication.

Passwords MUST:

Never be stored as plaintext

Be hashed using Argon2id or bcrypt

Have secure session handling

Have logout functionality

Deployment

The application should be designed for:

Vercel / similar frontend hosting

MongoDB Atlas for database

Keep configuration environment-based using .env.

3. Users

The database should support exactly two authorized users for the MVP.

Example:

User 1:

id

username

email

password_hash

created_at

User 2:

id

username

email

password_hash

created_at

There should NOT be a public registration page.

Instead, provide either:

A secure seed/setup script that creates the two users, OR

An admin-only setup mechanism that can be disabled after initial setup.

For MVP, prefer a seed script.

Example environment variables:

USER1_EMAIL=
USER1_PASSWORD=
USER1_NAME=

USER2_EMAIL=
USER2_PASSWORD=
USER2_NAME=

DATABASE_URL=
SESSION_SECRET=


Do not expose passwords or secrets to the frontend.

4. Authentication

Create:

/login

Login form:

Email/username

Password

Login button

Authentication requirements:

Secure password hashing

Secure HTTP-only session cookie

SameSite protection

CSRF protection where applicable

Rate limiting on login attempts

Generic error messages for invalid credentials

Logout endpoint

Protected chat route

Unauthenticated users attempting to access /chat should automatically be redirected to /login.

Authenticated users should NOT be able to access another user's account or create additional users.

5. Chat Interface

Create a clean modern chat UI similar to WhatsApp/Telegram but much simpler.

Layout:

------------------------------------------------
| Private Chat                         Logout  |
------------------------------------------------
|                                              |
|                    Hello!                    |
|                                              |
|  Hi, how are you?                            |
|                                              |
|                    I'm good!                 |
|                                              |
|  What are you doing?                         |
|                                              |
------------------------------------------------
| Type a message...                    [Send]  |
------------------------------------------------


Messages should clearly distinguish:

Messages sent by current user

Messages received from the other user

Show:

Sender

Message

Timestamp

Optional MVP enhancement:

"Sent"

"Delivered"

"Read"

6. Sending Messages

Users should be able to:

Type a message

Press Enter to send

Click Send

Send text messages

See the new message immediately

Prevent:

Empty messages

Excessively large messages

Malicious HTML/JavaScript

XSS attacks

Sanitize/escape message content before displaying it.

For MVP, support text only.

Do NOT implement:

Images

Videos

Voice messages

File uploads

GIFs

Stickers

These can be added later.

7. Real-Time Messaging

Implement real-time or near-real-time message updates.

Preferred approach:

WebSockets / Socket.IO

Alternative for a simpler MVP:

Poll the backend every 2–5 seconds

The architecture should make it easy to replace polling with WebSockets later.

When User A sends a message:

Save it to the database

Return the created message

Display it immediately

User B should receive the message without manually refreshing the page

8. Database Schema

Use MongoDB.

Create a users collection.

Example:

{
  _id: ObjectId,
  username: String,
  email: String,
  passwordHash: String,
  createdAt: Date
}


Create a messages collection.

Example:

{
  _id: ObjectId,
  senderId: ObjectId,
  receiverId: ObjectId,
  content: String,
  createdAt: Date
}


Create an index optimized for chat history:

(senderId, receiverId, createdAt)


Also consider an index on:

createdAt


if required for retention/cleanup.

9. 50 Lakh Message Limit

The application must support a maximum history of:

5,000,000 messages

This means the system should be designed so that up to 50 lakh messages can exist without attempting to load all messages into the browser.

IMPORTANT:

Never do:

SELECT * FROM messages


or retrieve all MongoDB documents at once.

Messages MUST be paginated.

For example:

GET /api/messages?limit=50&before=<message_id>


Load the newest 50 messages initially.

When the user scrolls upward, fetch older messages.

Example:

Newest 50
↓
Older 50
↓
Older 50
↓
...


Use cursor-based pagination rather than expensive offset pagination wherever possible.

10. Message Retention

The database should support up to exactly:

5,000,000 messages

When the number exceeds 5,000,000:

Delete the oldest messages first.

Example:

Current messages = 5,000,000
New message arrives
↓
Delete oldest message
↓
Insert new message
↓
Total = 5,000,000


Implement this as a backend/database maintenance operation.

Do NOT perform expensive counting and deletion on every frontend request.

Design the cleanup mechanism efficiently.

Possible approach:

Maintain a message counter

Run cleanup after insertion

Or use a scheduled background job

Delete in batches when necessary

The exact implementation should be chosen based on MongoDB best practices.

11. Performance Requirements

The application should remain responsive even with millions of messages.

Requirements:

Cursor-based pagination

Proper database indexes

Never load millions of messages into the browser

Only load the latest 50–100 messages initially

Lazy-load older messages

Virtualize the message list if necessary

Avoid unnecessary database queries

Use connection pooling

Use database projections where appropriate

The UI should remain fast even when the database contains close to 5 million messages.

12. Search

For the MVP, do NOT implement full message search unless it is simple to add.

If implemented, provide:

Search messages


with pagination.

Do not load the entire message history to perform client-side searching.

13. Security

Treat security as a core requirement.

Implement:

Password hashing

HTTP-only cookies

Secure cookies in production

Session expiration

Logout

Input validation

XSS prevention

CSRF protection where applicable

Rate limiting

Server-side authorization

MongoDB injection protection

Environment variables for secrets

HTTPS in production

No passwords in frontend code

No database credentials in frontend code

No sensitive information in API responses

IMPORTANT:

Never trust the user ID sent from the frontend.

The backend must determine the authenticated user from the secure session.

A user should only be able to:

Read their own conversation with the other authorized user

Send messages as themselves

14. API Design

Create clean API endpoints.

Example:

Login

POST /api/auth/login


Logout

POST /api/auth/logout


Current user

GET /api/auth/me


Get messages

GET /api/messages?limit=50&before=<cursor>


Send message

POST /api/messages


Request:

{
  "content": "Hello!"
}


Optional delete message

DELETE /api/messages/:id


Only allow deletion if it is part of the MVP requirements.

15. UI/UX

Make the interface minimal and polished.

Login page

Centered card:

Private Chat

Email
[________________]

Password
[________________]

[ Login ]


Chat page

Header:

Private Chat
Online
                              Logout


Message area:

             Hello 👋

Hey! How are you?

             I'm good!


Composer:

[ Type a message...                 ] [Send]


Requirements:

Mobile responsive

Desktop responsive

Keyboard-friendly

Enter = send

Shift + Enter = newline

Auto-scroll to newest message when appropriate

Do not force-scroll if user is reading older messages

Loading state

Empty state

Error state

Connection status if using WebSockets

16. Environment Configuration

Create:

.env.example


Example:

DATABASE_URL=
SESSION_SECRET=

USER1_EMAIL=
USER1_PASSWORD=
USER1_NAME=

USER2_EMAIL=
USER2_PASSWORD=
USER2_NAME=


Never commit .env.

Create:

.gitignore


with:

.env
.env.local
node_modules
.next


17. Project Structure

Use a clean structure similar to:

src/
  app/
    login/
    chat/
    api/
      auth/
        login/
        logout/
        me/
      messages/

  components/
    ChatWindow
    MessageBubble
    MessageInput
    LoginForm

  lib/
    auth
    db
    validation

  models/
    User
    Message


Adapt this structure if the chosen framework requires a different convention.

Keep database, authentication, validation, and UI logic separated.

18. Initial Setup

Provide:

npm install


and database setup instructions.

Provide a seed command such as:

npm run seed


The seed command should:

Connect to MongoDB

Create the two users

Hash their passwords

Avoid creating duplicates

Exit cleanly

Example:

npm run dev


should start the development server.

19. Error Handling

Handle:

Invalid login

Database unavailable

Message send failure

Session expiration

Network failure

Empty messages

Message too long

Unauthorized API requests

Show friendly UI messages without exposing internal errors.

Example:

Unable to send message. Please try again.


Do not expose:

MongoServerError...


to the user.

20. Testing

Create basic tests for:

Authentication

Valid login

Invalid password

Logout

Unauthorized chat access

Messages

Send message

Retrieve messages

Pagination

Unauthorized message access

Empty message validation

Message length validation

Security

User cannot impersonate the other user

User cannot access arbitrary message IDs

XSS payloads are safely rendered

Sessions are properly protected

21. Acceptance Criteria

The MVP is complete when:

Two users can log in

Passwords are securely hashed

Users cannot register additional accounts

Unauthenticated users cannot access chat

User A can send messages to User B

User B can send messages to User A

Messages persist in cloud MongoDB

Messages appear without page refresh

Chat history is paginated

Latest messages load first

Older messages load when scrolling upward

The system can store up to 5,000,000 messages

Oldest messages are removed when the limit is exceeded

Database indexes are implemented

Secrets are stored in environment variables

No passwords are exposed to the frontend

Basic rate limiting exists

XSS/injection protections exist

UI works on desktop and mobile

Logout works

Basic automated tests exist

README contains setup/deployment instructions

22. Important MVP Constraints

Do NOT over-engineer the first version.

Do not add:

Group chat

Public profiles

Friend requests

Social feed

Notifications

File sharing

Video calling

Audio calling

Complex admin dashboard

Payments

AI chatbot

Multiple chat rooms

Focus on making:

Login → Private 1-to-1 Chat → Persistent History → Secure Database → 5M Message Capacity

work extremely well.

23. Deliverables

Provide the complete working project including:

Source code

MongoDB schema/models

Authentication implementation

Chat UI

API routes

Pagination

Message retention/5M limit logic

Database indexes

Seed script

.env.example

.gitignore

Tests

README

Local development instructions

Production deployment instructions

Before considering the project complete, verify the entire authentication and messaging flow end-to-end.

Prioritize security, simplicity, reliability, and performance over adding extra features.

BUILD ONLY FRONTEND

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/280e20eb-163a-43ff-88da-4800038535b0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
