//const { db } = require('@vercel/postgres');
const { MongoClient } = require('mongodb');
const {
  invoices,
  customers,
  revenue,
  users,
} = require('../app/lib/placeholder-data.js');
//const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');


const DB_NAME = 'dashboard';

async function seedUsers(client) {
  try {

    // insert users into users collection
    const usersCollection = client.db(DB_NAME).collection('users');
    const insertedUsers = await usersCollection.insertMany(users);
    
    console.log(`Seeded ${insertedUsers.insertedCount} users`);

    return {
      users: insertedUsers,
    };
  } catch (error) {
    console.error('Error seeding users:', error);
    throw error;
  }
}

async function seedInvoices(client) {
  try {
    // insert invoices into invoices collection
    const invoicesCollection = client.db(DB_NAME).collection('invoices');
    const insertedInvoices = await invoicesCollection.insertMany(
      invoices.map((invoice) => {return {...invoice, id: uuidv4()}}));

    console.log(`Seeded ${insertedInvoices.insertedCount} invoices`);

    return {
      invoices: insertedInvoices,
    };
  } catch (error) {
    console.error('Error seeding invoices:', error);
    throw error;
  }
}

async function seedCustomers(client) {
  try {
    // insert customers into customers collection
    const customersCollection = client.db(DB_NAME).collection('customers');
    const insertedCustomers = await customersCollection.insertMany(customers);

    console.log(`Seeded ${insertedCustomers.insertedCount} customers`);

    return {
      customers: insertedCustomers,
    };
  } catch (error) {
    console.error('Error seeding customers:', error);
    throw error;
  }
}

async function seedRevenue(client) {
  try {
    // insert revenue into revenue collection
    const revenueCollection = client.db(DB_NAME).collection('revenue');
    const insertedRevenue = await revenueCollection.insertMany(revenue);

    console.log(`Seeded ${insertedRevenue.insertedCount} revenue`);

    return {
      revenue: insertedRevenue,
    };
  } catch (error) {
    console.error('Error seeding revenue:', error);
    throw error;
  }
}

async function main() {
  //const client = await db.connect();
  const client = new MongoClient(process.env.MONGODB_URI);

  await client.connect();
  await seedUsers(client);
  await seedCustomers(client);
  await seedInvoices(client);
  await seedRevenue(client);

  await client.close();
}

main().catch((err) => {
  console.error(
    'An error occurred while attempting to seed the database:',
    err,
  );
});
