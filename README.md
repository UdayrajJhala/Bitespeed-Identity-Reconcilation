# Bitespeed Identity Reconciliation

Identity reconciliation service that links customer contacts across multiple purchases.

Live endpoint: `https://bitespeed-identity-reconcilation-2x9v.onrender.com`

## Setup

```bash
npm install
npm run dev
```

## Environment Variables

Create `.env` file:
```
DATABASE_URL=your_postgres_url
PORT=desired_port_number
```

## API

### POST /identify

Request:
```json
{
  "email": "abc@xyz.com",
  "phoneNumber": "1234567890"
}
```

Response:
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["abc@xyz.com"],
    "phoneNumbers": ["1234567890"],
    "secondaryContactIds": []
  }
}
```
## Tech Stack 

- **Node and Express with typescript** – Runtime
- **PostgreSQL (hosted on Neon)** – Relational Database 
- **Render** – Deployment

## How it works

- Creates new primary contact if no matches found
- Links contacts that share email or phone number
- Creates secondary contacts for new information
- Merges separate primary contacts when they're linked by new data
- Self pings the health checkpoint every 5 minutes to keep the render service alive

