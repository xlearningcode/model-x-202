# Requirements Document

## 1. Application Overview

**Application Name**: Model-x-202

**Description**: A web-based chatbot application that enables users to interact with an AI assistant through text conversations, generate images from text prompts, and analyze uploaded images. The application integrates with Supabase for user authentication, chat history storage, and file management. Users can subscribe to premium plans through Stripe payment system. Free users have daily usage limits, while Pro users enjoy unlimited access.

## 2. Users and Usage Scenarios

**Target Users**: General users who need AI assistance for conversations, image generation, and image analysis.

**Core Usage Scenarios**:
- Users engage in text-based conversations with an AI assistant to get answers, suggestions, or creative content
- Users generate images by providing text descriptions
- Users upload images for AI analysis and receive descriptive or analytical responses
- Users manage their conversation history and access previous chats
- Users subscribe to premium plans for enhanced features and unlimited usage
- Users manage their subscription and account settings

## 3. Page Structure and Functionality

### 3.1 Page Structure

```
Model-x-202
├── Login/Registration Page
├── Main Chat Interface
│   ├── Chat History Sidebar
│   ├── Chat Area
│   └── Input Area
├── User Profile Settings Page
│   ├── Account Information
│   ├── Subscription Management
│   ├── Password Change
│   └── Preferences
└── Subscription/Payment Page
```

### 3.2 Login/Registration Page

**Registration**:
- Users enter email and password to create an account
- System validates email format and password requirements
- Upon successful registration, user account is created in Supabase database

**Login**:
- Users enter email and password to access the application
- System authenticates credentials against Supabase database
- Upon successful login, users are directed to Main Chat Interface

**Supabase Integration**:
- Database URL: https://fjvfxznayyrnfiqpgalg.supabase.co
- Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdmZ4em5heXlybmZpcXBnYWxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzMwNzAsImV4cCI6MjA5NzcwOTA3MH0.YHOUcvKFEAj4KFfJvWCLFgMiqUcZ3uTr-ASLj7L_4H8

### 3.3 Main Chat Interface

#### 3.3.1 Chat History Sidebar

**Conversation List**:
- Display list of user's previous conversations
- Show conversation title and timestamp
- Support scrolling for long conversation lists

**Conversation Management**:
- New Chat: Create a new conversation session
- Delete: Remove selected conversation from history
- Rename: Edit conversation title

**Theme Toggle**:
- Switch between dark mode and light mode

#### 3.3.2 Chat Area

**AI Chat**:
- Display conversation messages in chronological order
- Show user messages and AI responses
- Support streaming responses where AI responses appear progressively
- Display generated images within the chat when image generation is requested
- Display AI analysis results when images are uploaded
- Detect Banglish input (Bangla words written in Roman script) and respond in Bengali script
- Display retry notification when rate limit errors occur

**Message Display**:
- User messages aligned to one side
- AI responses aligned to opposite side
- Timestamp for each message

**Usage Limit Notification**:
- When Free user reaches daily message limit (50 messages), display notification: \"You've reached your daily message limit. Upgrade to Pro for unlimited messages.\"
- When Free user reaches daily image generation limit (3 images), display notification: \"You've reached your daily image generation limit. Upgrade to Pro for unlimited image generations.\"
- Include \"Upgrade to Pro\" button in notification that links to Subscription/Payment Page

#### 3.3.3 Input Area

**Text Input**:
- Text field for users to type messages or image generation prompts
- Send button to submit messages
- Automatic detection of Banglish input
- Disable send button when Free user has reached daily message limit

**Image Upload**:
- Upload button for users to select and upload images
- Uploaded images are sent to AI for analysis
- AI responds with description or analysis of the image

**Image Generation**:
- Users type text prompts describing desired images
- System generates images based on prompts
- Generated images are displayed in chat area
- Generated images are stored in Supabase file storage
- Disable image generation when Free user has reached daily image generation limit

**Usage Counter Display**:
- For Free users, display remaining daily usage: \"Messages: X/50 | Images: Y/3\"
- For Pro users, display: \"Unlimited usage\"

### 3.4 User Profile Settings Page

**Account Information**:
- Display user email
- Display account creation date
- Display current subscription plan status
- Display current daily usage statistics for Free users

**Subscription Management**:
- View current subscription plan (Free/Monthly/Yearly)
- View subscription expiration date
- Upgrade or change subscription plan
- Cancel subscription
- View payment history
- Access to Subscription/Payment Page

**Password Change**:
- Enter current password
- Enter new password
- Confirm new password
- Update password in Supabase database

**Preferences**:
- Theme preference (dark/light mode)
- Language preference
- Notification settings

**Account Management**:
- Logout functionality

### 3.5 Subscription/Payment Page

**Pricing Plans Display**:
- Free Plan: Display features (50 messages/day, 3 image generations/day) and limitations
- Monthly Plan: Display price, features (unlimited messages, unlimited image generations), and benefits
- Yearly Plan: Display price, features (unlimited messages, unlimited image generations), benefits, and savings compared to monthly

**Plan Selection**:
- Users select desired plan (Monthly or Yearly)
- Display plan details and pricing

**Payment Processing**:
- Integrate Stripe payment system for subscription checkout
- Users enter payment information through Stripe secure form
- Process payment and activate subscription
- Store subscription status in Supabase database

**Subscription Confirmation**:
- Display confirmation message upon successful payment
- Send confirmation email to user
- Redirect to Main Chat Interface or User Profile Settings Page

## 4. Business Rules and Logic

### 4.1 Authentication Flow
- Users must be logged in to access Main Chat Interface
- Unauthenticated users are redirected to Login/Registration Page
- Session management handled through Supabase authentication

### 4.2 Chat History Storage
- All conversations are automatically saved to Supabase database
- Each message includes: user ID, conversation ID, message content, timestamp, message type (text/image)
- Chat history is loaded when user selects a conversation from sidebar

### 4.3 Image Storage
- Generated images are stored in Supabase file storage
- Each image is associated with the conversation and message where it was generated
- Image URLs are stored in chat history for retrieval

### 4.4 Conversation Management
- New Chat: Creates a new conversation session with unique conversation ID
- Delete: Removes conversation and all associated messages from database
- Rename: Updates conversation title in database

### 4.5 Streaming Response
- AI responses are displayed progressively as they are generated
- Users can see partial responses before completion

### 4.6 Banglish Detection and Response
- System detects when users type Banglish (Bangla words in Roman script)
- Examples of Banglish input: \"tumi kamon aso\", \"ami bhalo achi\", \"kemon acho\"
- When Banglish is detected, AI responds in Bengali script
- Detection occurs before sending message to large-language-model edge function

### 4.7 Rate Limit Error Handling
- When 429 rate limit error occurs from large-language-model edge function, system implements retry logic
- Retry attempts: 3 times with exponential backoff (wait 2 seconds, then 4 seconds, then 8 seconds)
- Display user-friendly notification: \"Service is busy, retrying automatically...\"
- If all retries fail, display error message: \"Service temporarily unavailable. Please try again in a few minutes.\"
- Allow users to manually retry after all automatic attempts fail

### 4.8 Subscription Management
- Free Plan: Default plan for all new users
- Monthly Plan: Recurring monthly subscription
- Yearly Plan: Recurring yearly subscription with discounted rate
- Subscription status stored in Supabase database linked to user account
- Stripe handles recurring billing automatically
- Users can upgrade, downgrade, or cancel subscription at any time
- Cancellation takes effect at end of current billing period

### 4.9 Payment Processing
- Stripe integration for secure payment processing
- Payment information never stored in application database
- Subscription activation upon successful payment
- Payment failure notifications sent to users
- Automatic subscription renewal handled by Stripe

### 4.10 Usage Limit Tracking and Enforcement

**Daily Usage Limits**:
- Free Plan: 50 chat messages per day, 3 image generations per day
- Pro Plans (Monthly/Yearly): Unlimited messages and unlimited image generations

**Usage Tracking**:
- Track message count and image generation count per user per UTC day
- Store usage data in Supabase database
- Query current usage before allowing new message or image generation

**Daily Reset**:
- Usage counters reset at 00:00 UTC each day
- Reset applies to all Free users automatically

**Limit Enforcement**:
- Before processing message: Check if Free user has reached 50 messages for current UTC day
- Before processing image generation: Check if Free user has reached 3 image generations for current UTC day
- If limit reached, prevent action and display upgrade prompt
- Pro users bypass all limit checks

**Upgrade Prompt**:
- Display clear message indicating limit reached
- Include \"Upgrade to Pro\" button linking to Subscription/Payment Page
- Show benefits of Pro plan (unlimited usage)

## 5. Exceptions and Edge Cases

| Scenario | Handling |
|----------|----------|
| Invalid email format during registration | Display error message, prevent registration |
| Incorrect login credentials | Display error message, allow retry |
| Network error during chat | Display error notification, allow retry |
| Image upload fails | Display error message, allow re-upload |
| Image generation fails | Display error message in chat, allow retry |
| Empty message submission | Prevent sending, no action taken |
| User attempts to delete last conversation | Allow deletion, create new empty conversation |
| Supabase connection failure | Display error notification, prevent data operations |
| 429 rate limit error from edge function | Implement retry logic with exponential backoff, display user notification |
| Banglish detection fails | AI responds in default language, user can retry |
| Payment processing fails | Display error message, allow retry, do not activate subscription |
| Stripe connection error | Display error notification, prevent payment operations |
| User attempts to subscribe while already subscribed | Display current plan status, offer plan change option |
| Subscription renewal fails | Send notification to user, retry payment, suspend access if payment continues to fail |
| User cancels subscription | Maintain access until end of billing period, then revert to Free Plan |
| Invalid password during password change | Display error message, prevent update |
| New password does not meet requirements | Display error message with requirements, prevent update |
| Free user reaches daily message limit | Display upgrade prompt, disable message sending until next UTC day |
| Free user reaches daily image generation limit | Display upgrade prompt, disable image generation until next UTC day |
| Usage tracking data unavailable | Allow action to proceed, log error for investigation |
| User upgrades from Free to Pro mid-day | Immediately grant unlimited access, stop tracking usage limits |
| User downgrades from Pro to Free mid-billing period | Maintain Pro access until end of billing period, then apply Free limits |
| UTC day transition during active session | Reset usage counters, allow Free user to continue with refreshed limits |

## 6. Acceptance Criteria

1. User registers with email and password, account is created in Supabase database with Free plan
2. User logs in with credentials and accesses Main Chat Interface
3. Free user sends 50 messages in one UTC day, system displays upgrade prompt and disables further messaging
4. Free user generates 3 images in one UTC day, system displays upgrade prompt and disables further image generation
5. Free user upgrades to Pro plan via Subscription/Payment Page, immediately gains unlimited access
6. Pro user sends unlimited messages and generates unlimited images without restrictions
7. Free user's usage counters reset at 00:00 UTC, allowing 50 new messages and 3 new image generations
8. User views remaining daily usage in Input Area (for Free users) or sees \"Unlimited usage\" (for Pro users)

## 7. Out of Scope for Current Release

- Multi-language support beyond Bengali/Banglish detection
- Voice input/output
- Conversation search functionality
- Export chat history
- Collaborative conversations with multiple users
- Advanced image editing capabilities
- Integration with third-party AI models beyond the default
- Mobile native applications
- Conversation folders or categorization
- Message editing or deletion
- Real-time collaboration features
- Multiple payment methods beyond Stripe
- Refund processing
- Invoice generation
- Team or enterprise subscription plans
- Usage analytics dashboard
- API access for developers
- Custom usage limit configurations
- Usage history reports
- Rollover of unused daily limits
- Temporary limit increases or promotions