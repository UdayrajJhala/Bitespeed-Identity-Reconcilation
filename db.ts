import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initDB(): Promise<void> {
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

export interface Contact {
  id: number;
  phonenumber?: string;
  email?: string;
  linkedid?: number;
  linkprecedence: "primary" | "secondary";
  createdat: Date;
  updatedat: Date;
  deletedat?: Date;
}

export interface ContactResponse {
  primaryContactId: number;
  emails: string[];
  phoneNumbers: string[];
  secondaryContactIds: number[];
}

export class ContactService {
  static async findExistingContacts(
    email?: string,
    phoneNumber?: string
  ): Promise<Contact[]> {
    const existingQuery = `
      SELECT * FROM Contact 
      WHERE deletedAt IS NULL 
      AND (email = $1 OR phoneNumber = $2)
      ORDER BY createdAt ASC
    `;

    const result = await pool.query(existingQuery, [
      email || null,
      phoneNumber || null,
    ]);

    return result.rows;
  }

  static async createPrimaryContact(
    phoneNumber?: string,
    email?: string
  ): Promise<Contact> {
    const result = await pool.query(
      `
      INSERT INTO Contact (phoneNumber, email, linkPrecedence)
      VALUES ($1, $2, 'primary')
      RETURNING *
    `,
      [phoneNumber || null, email || null]
    );

    return result.rows[0];
  }

  static async findSecondaryContacts(primaryId: number): Promise<Contact[]> {
    const result = await pool.query(
      `
      SELECT * FROM Contact 
      WHERE linkedId = $1 AND deletedAt IS NULL
    `,
      [primaryId]
    );

    return result.rows;
  }

  static async findAllRelatedContacts(ids: number[]): Promise<Contact[]> {
    const result = await pool.query(
      `
      SELECT * FROM Contact 
      WHERE id = ANY($1) AND deletedAt IS NULL
      ORDER BY createdAt ASC
    `,
      [ids]
    );

    return result.rows;
  }

  static async findAllMatchingContacts(
    email?: string,
    phoneNumber?: string
  ): Promise<Contact[]> {
    const result = await pool.query(
      `
      SELECT DISTINCT c.* FROM Contact c
      WHERE c.deletedAt IS NULL 
      AND (c.email = $1 OR c.phoneNumber = $2 
           OR c.id IN (
             SELECT linkedId FROM Contact 
             WHERE deletedAt IS NULL AND (email = $1 OR phoneNumber = $2)
           )
           OR c.linkedId IN (
             SELECT id FROM Contact 
             WHERE deletedAt IS NULL AND (email = $1 OR phoneNumber = $2)
           ))
      ORDER BY createdAt ASC
    `,
      [email || null, phoneNumber || null]
    );

    return result.rows;
  }

  static async createSecondaryContact(
    phoneNumber?: string,
    email?: string,
    linkedId?: number
  ): Promise<Contact> {
    const result = await pool.query(
      `
      INSERT INTO Contact (phoneNumber, email, linkedId, linkPrecedence)
      VALUES ($1, $2, $3, 'secondary')
      RETURNING *
    `,
      [phoneNumber || null, email || null, linkedId]
    );

    return result.rows[0];
  }

  static async updateContactToSecondary(
    contactId: number,
    linkedId: number
  ): Promise<void> {
    await pool.query(
      `
      UPDATE Contact 
      SET linkedId = $1, linkPrecedence = 'secondary', updatedAt = CURRENT_TIMESTAMP
      WHERE id = $2
    `,
      [linkedId, contactId]
    );
  }
}
