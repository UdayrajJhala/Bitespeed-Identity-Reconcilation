import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initDB, ContactService, Contact, ContactResponse } from "./db";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

initDB();

app.get("/", (req, res) => {
  res.json({ message: "Bitespeed Identity Service Running" });
});

app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.post("/identify", async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
      return res
        .status(400)
        .json({ error: "Either email or phoneNumber required" });
    }

    const existing = await ContactService.findExistingContacts(
      email,
      phoneNumber
    );

    if (existing.length === 0) {
      const newContact = await ContactService.createPrimaryContact(
        phoneNumber,
        email
      );

      return res.json({
        contact: {
          primaryContactId: newContact.id,
          emails: email ? [email] : [],
          phoneNumbers: phoneNumber ? [phoneNumber] : [],
          secondaryContactIds: [],
        },
      });
    }

    let allRelatedIds = new Set<number>();
    for (let contact of existing) {
      let primaryId = contact.linkedid || contact.id;
      allRelatedIds.add(primaryId);

      const secondaries = await ContactService.findSecondaryContacts(primaryId);
      secondaries.forEach((sec) => allRelatedIds.add(sec.id));
    }

    const allRelated = await ContactService.findAllRelatedContacts(
      Array.from(allRelatedIds)
    );

    const allMatchingContacts = await ContactService.findAllMatchingContacts(
      email,
      phoneNumber
    );
    const finalContacts = allMatchingContacts;

    const exactMatch = finalContacts.find(
      (c) =>
        c.email === (email || null) && c.phonenumber === (phoneNumber || null)
    );

    if (!exactMatch) {
      const hasNewEmail =
        email && !finalContacts.some((c) => c.email === email);
      const hasNewPhone =
        phoneNumber &&
        !finalContacts.some((c) => c.phonenumber === phoneNumber);

      if (hasNewEmail || hasNewPhone) {
        const primary =
          finalContacts.find((c) => c.linkprecedence === "primary") ||
          finalContacts[0];

        const newSecondary = await ContactService.createSecondaryContact(
          phoneNumber,
          email,
          primary.id
        );

        finalContacts.push(newSecondary);
      }
    }

    const primaries = finalContacts.filter(
      (c) => c.linkprecedence === "primary"
    );

    if (primaries.length > 1) {
      const oldestPrimary = primaries[0];
      for (let i = 1; i < primaries.length; i++) {
        await ContactService.updateContactToSecondary(
          primaries[i].id,
          oldestPrimary.id
        );
        primaries[i].linkedid = oldestPrimary.id;
        primaries[i].linkprecedence = "secondary";
      }
    }

    const primary =
      finalContacts.find((c) => c.linkprecedence === "primary") ||
      finalContacts[0];
    const secondaries = finalContacts.filter((c) => c.id !== primary.id);

    const emails = [
      ...new Set(finalContacts.map((c) => c.email).filter(Boolean)),
    ];
    const phoneNumbers = [
      ...new Set(finalContacts.map((c) => c.phonenumber).filter(Boolean)),
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

