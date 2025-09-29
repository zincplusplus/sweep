// Email database using IndexedDB
export type EmailRecord = {
  id: string;              // Gmail message ID (primary key)
  month: string;           // "2020/3" - which month we found it in
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  sizeEstimate?: number;   // size in bytes from Gmail API
  listUnsubscribeValue?: string; // actual unsubscribe header value (truthy = newsletter)
  scannedAt: number;       // when first discovered
  detailsFetchedAt?: number; // when details were added
};

export type ScanProgress = {
  id: 'current_scan';
  lastSuccessfulMonth: string; // "2020/3"
  timestamp: number;
};

class EmailDB {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'EmailScanDB';
  private readonly version = 1;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create emails table
        if (!db.objectStoreNames.contains('emails')) {
          const emailStore = db.createObjectStore('emails', { keyPath: 'id' });
          emailStore.createIndex('month', 'month', { unique: false });
          emailStore.createIndex('from', 'from', { unique: false });
          emailStore.createIndex('listUnsubscribeValue', 'listUnsubscribeValue', { unique: false });
        }

        // Create scan progress table
        if (!db.objectStoreNames.contains('scanProgress')) {
          db.createObjectStore('scanProgress', { keyPath: 'id' });
        }
      };
    });
  }

  async addEmail(email: EmailRecord): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['emails'], 'readwrite');
      const store = transaction.objectStore('emails');
      const request = store.put(email);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async addEmails(emails: EmailRecord[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['emails'], 'readwrite');
      const store = transaction.objectStore('emails');

      let completed = 0;
      let hasError = false;

      emails.forEach(email => {
        const request = store.put(email);
        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(request.error);
          }
        };
        request.onsuccess = () => {
          completed++;
          if (completed === emails.length && !hasError) {
            resolve();
          }
        };
      });
    });
  }

  async getEmail(id: string): Promise<EmailRecord | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['emails'], 'readonly');
      const store = transaction.objectStore('emails');
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async emailExists(id: string): Promise<boolean> {
    const email = await this.getEmail(id);
    return email !== null;
  }

  async saveScanProgress(lastSuccessfulMonth: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const progress: ScanProgress = {
      id: 'current_scan',
      lastSuccessfulMonth,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['scanProgress'], 'readwrite');
      const store = transaction.objectStore('scanProgress');
      const request = store.put(progress);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async loadScanProgress(): Promise<ScanProgress | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['scanProgress'], 'readonly');
      const store = transaction.objectStore('scanProgress');
      const request = store.get('current_scan');

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async clearScanProgress(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['scanProgress'], 'readwrite');
      const store = transaction.objectStore('scanProgress');
      const request = store.delete('current_scan');

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getAllEmails(): Promise<EmailRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['emails'], 'readonly');
      const store = transaction.objectStore('emails');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getEmailCount(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['emails'], 'readonly');
      const store = transaction.objectStore('emails');
      const request = store.count();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getEmailsWithoutDetailsCount(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['emails'], 'readonly');
      const store = transaction.objectStore('emails');
      const request = store.openCursor();
      let count = 0;

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const email = cursor.value as EmailRecord;
          if (!email.detailsFetchedAt) {
            count++;
          }
          cursor.continue();
        } else {
          resolve(count);
        }
      };
    });
  }

  async getEmailsWithDetailsCount(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['emails'], 'readonly');
      const store = transaction.objectStore('emails');
      const request = store.openCursor();
      let count = 0;

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const email = cursor.value as EmailRecord;
          if (email.detailsFetchedAt) {
            count++;
          }
          cursor.continue();
        } else {
          resolve(count);
        }
      };
    });
  }

  async clearAllEmails(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['emails'], 'readwrite');
      const store = transaction.objectStore('emails');
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getFirstEmailWithoutDetails(): Promise<EmailRecord | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['emails'], 'readonly');
      const store = transaction.objectStore('emails');
      const request = store.openCursor();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const email = cursor.value as EmailRecord;
          // Check if this email doesn't have details fetched yet
          if (!email.detailsFetchedAt) {
            resolve(email);
            return;
          }
          cursor.continue();
        } else {
          // No more emails without details
          resolve(null);
        }
      };
    });
  }

  async updateEmailWithDetails(
    id: string,
    details: {
      from?: string;
      to?: string;
      subject?: string;
      date?: string;
      sizeEstimate?: number;
      listUnsubscribeValue?: string;
    }
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const email = await this.getEmail(id);
    if (!email) throw new Error(`Email with ID ${id} not found`);

    const updatedEmail: EmailRecord = {
      ...email,
      ...details,
      detailsFetchedAt: Date.now()
    };

    await this.addEmail(updatedEmail);
  }
}

// Helper function to parse Gmail API message and extract details
export function parseEmailDetails(gmailMessage: any) {
  const headers = gmailMessage.payload?.headers || [];

  // Find specific headers
  const fromHeader = headers.find((h: any) => h.name === 'From')?.value;
  const toHeader = headers.find((h: any) => h.name === 'To')?.value;
  const subjectHeader = headers.find((h: any) => h.name === 'Subject')?.value;
  const dateHeader = headers.find((h: any) => h.name === 'Date')?.value;
  const listUnsubscribeHeader = headers.find((h: any) => h.name === 'List-Unsubscribe')?.value;

  return {
    from: fromHeader,
    to: toHeader,
    subject: subjectHeader,
    date: dateHeader,
    sizeEstimate: gmailMessage.sizeEstimate,
    listUnsubscribeValue: listUnsubscribeHeader || undefined
  };
}

// Helper function to check if scan is complete
export async function isScanComplete(): Promise<boolean> {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // getMonth() returns 0-11

  const savedProgress = await emailDB.loadScanProgress();
  const emailCount = await emailDB.getEmailCount();

  // If we have saved progress, check if it's up to current month
  if (savedProgress) {
    const [lastYear, lastMonth] = savedProgress.lastSuccessfulMonth.split('/').map(Number);
    return lastYear >= currentYear && lastMonth >= currentMonth;
  }

  // If no saved progress but we have emails, assume scan was completed and cleared
  // This happens when scan finishes successfully and clearScanProgress() is called
  if (emailCount > 0) {
    return true;
  }

  return false;
}

// Helper function to find the last month we have email data for
export async function getLastMonthWithData(): Promise<string | null> {
  const emails = await emailDB.getAllEmails();

  if (emails.length === 0) {
    return null;
  }

  // Get all unique months and find the latest one
  const months = [...new Set(emails.map(email => email.month))];

  // Sort months in descending order (latest first)
  months.sort((a, b) => {
    const [aYear, aMonth] = a.split('/').map(Number);
    const [bYear, bMonth] = b.split('/').map(Number);

    if (aYear !== bYear) {
      return bYear - aYear; // Sort by year descending
    }
    return bMonth - aMonth; // Sort by month descending
  });

  return months[0] || null;
}

// Singleton instance
export const emailDB = new EmailDB();