import express from "express";
import { Pool } from "pg";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL,
});

app.use(cors());
app.use(express.json());

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Contact (
        id SERIAL PRIMARY KEY,
        phoneNumber VARCHAR(20),
        email VARCHAR(255),
        linkedId INTEGER REFERENCES Contact(id),
        linkPrecedence VARCHAR(10) CHECK (linkPrecedence IN ('primary', 'secondary')) NOT NULL,
        createdAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        deletedAt TIMESTAMP WITH TIME ZONE
      )
    `);
    console.log("Database table ready");
  } catch (error) {
    console.error("DB init error:", error);
  }
}

initDB();

app.get("/", (req, res) => {
  res.json({ message: "Bitespeed Identity Service Running" });
});

app.post("/identify", async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
      return res
        .status(400)
        .json({ error: "Either email or phoneNumber required" });
    }

    const existingQuery = `
      SELECT * FROM Contact 
      WHERE deletedAt IS NULL 
      AND (email = $1 OR phoneNumber = $2)
      ORDER BY createdAt ASC
    `;

    const existing = await pool.query(existingQuery, [
      email || null,
      phoneNumber || null,
    ]);

    if (existing.rows.length === 0) {
      const newContact = await pool.query(
        `
        INSERT INTO Contact (phoneNumber, email, linkPrecedence)
        VALUES ($1, $2, 'primary')
        RETURNING *
      `,
        [phoneNumber || null, email || null]
      );

      return res.json({
        contact: {
          primaryContactId: newContact.rows[0].id,
          emails: email ? [email] : [],
          phoneNumbers: phoneNumber ? [phoneNumber] : [],
          secondaryContactIds: [],
        },
      });
    }

    let allRelatedIds = new Set();
    for (let contact of existing.rows) {
      let primaryId = contact.linkedid || contact.id;
      allRelatedIds.add(primaryId);

      const secondaries = await pool.query(
        `
        SELECT * FROM Contact 
        WHERE linkedId = $1 AND deletedAt IS NULL
      `,
        [primaryId]
      );

      secondaries.rows.forEach((sec) => allRelatedIds.add(sec.id));
    }

    const allRelated = await pool.query(
      `
      SELECT * FROM Contact 
      WHERE id = ANY($1) AND deletedAt IS NULL
      ORDER BY createdAt ASC
    `,
      [Array.from(allRelatedIds)]
    );

    const exactMatch = allRelated.rows.find(
      (c) =>
        c.email === (email || null) && c.phonenumber === (phoneNumber || null)
    );

    if (!exactMatch) {
      const hasNewEmail =
        email && !allRelated.rows.some((c) => c.email === email);
      const hasNewPhone =
        phoneNumber &&
        !allRelated.rows.some((c) => c.phonenumber === phoneNumber);

      if (hasNewEmail || hasNewPhone) {
        const primary =
          allRelated.rows.find((c) => c.linkprecedence === "primary") ||
          allRelated.rows[0];

        const newSecondary = await pool.query(
          `
          INSERT INTO Contact (phoneNumber, email, linkedId, linkPrecedence)
          VALUES ($1, $2, $3, 'secondary')
          RETURNING *
        `,
          [phoneNumber || null, email || null, primary.id]
        );

        allRelated.rows.push(newSecondary.rows[0]);
      }
    }

    const primaries = allRelated.rows.filter(
      (c) => c.linkprecedence === "primary"
    );
    if (primaries.length > 1) {
      const oldestPrimary = primaries[0]; 

      for (let i = 1; i < primaries.length; i++) {
        await pool.query(
          `
          UPDATE Contact 
          SET linkedId = $1, linkPrecedence = 'secondary', updatedAt = CURRENT_TIMESTAMP
          WHERE id = $2
        `,
          [oldestPrimary.id, primaries[i].id]
        );

        primaries[i].linkedid = oldestPrimary.id;
        primaries[i].linkprecedence = "secondary";
      }
    }

    const primary =
      allRelated.rows.find((c) => c.linkprecedence === "primary") ||
      allRelated.rows[0];
    const secondaries = allRelated.rows.filter((c) => c.id !== primary.id);

    const emails = [
      ...new Set(allRelated.rows.map((c) => c.email).filter(Boolean)),
    ];
    const phoneNumbers = [
      ...new Set(allRelated.rows.map((c) => c.phonenumber).filter(Boolean)),
    ];

    if (primary.email && emails.includes(primary.email)) {
      emails.splice(emails.indexOf(primary.email), 1);
      emails.unshift(primary.email);
    }
    if (primary.phonenumber && phoneNumbers.includes(primary.phonenumber)) {
      phoneNumbers.splice(phoneNumbers.indexOf(primary.phonenumber), 1);
      phoneNumbers.unshift(primary.phonenumber);
    }

    res.json({
      contact: {
        primaryContactId: primary.id,
        emails: emails,
        phoneNumbers: phoneNumbers,
        secondaryContactIds: secondaries.map((c) => c.id),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
