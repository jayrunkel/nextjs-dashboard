import * as mongoDB from "mongodb";
import * as dotenv from "dotenv";

import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  User,
  Revenue,
} from './definitions';
import { formatCurrency } from './utils';
import { db } from "@vercel/postgres";


type MongoHandle = {
  client: mongoDB.MongoClient,
  db: mongoDB.Db
} | null;

let MONGO_HANDLE: MongoHandle = null;

export async function connectToDatabase () : Promise<MongoHandle> {
  try {
    const client: mongoDB.MongoClient = new mongoDB.MongoClient(process.env.MONGODB_URI!);       
    await client.connect();   
    const db: mongoDB.Db = client.db(process.env.DB_NAME);
    console.log(`Successfully connected to database: ${db.databaseName}`);
    return {client, db};
  }
  catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to connect to database.');
  }  
}

export async function fetchRevenue() {
  // Add noStore() here to prevent the response from being cached.
  // This is equivalent to in fetch(..., {cache: 'no-store'}).

  

  try {
    // Artificially delay a response for demo purposes.
    // Don't do this in production :)

    // console.log('Fetching revenue data...');
    // await new Promise((resolve) => setTimeout(resolve, 3000));
    if (!MONGO_HANDLE) {
      MONGO_HANDLE = await connectToDatabase();
    }
    const revenueCollection: mongoDB.Collection = MONGO_HANDLE!.db.collection("revenue");

    const data = await revenueCollection.find().toArray();

    // console.log('Data fetch completed after 3 seconds.');

    return data;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch revenue data.');
  }
}

export async function fetchLatestInvoices() {

  const mqlLatestInvoices = 
  [
    {
      '$limit': 5
    }, {
      '$lookup': {
        'from': 'customers', 
        'localField': 'customer_id', 
        'foreignField': 'id', 
        'as': 'customer'
      }
    }, {
      '$replaceRoot': {
        'newRoot': {
          '$mergeObjects': [
            {
              '$setField': {
                  'field': 'customer', 
                  'input': '$$ROOT', 
                  'value': '$$REMOVE'
              }
            }, 
            {
              '$setField': {
                'field': 'customer_id', 
                'input': {'$first': '$customer'},
                'value': '$$REMOVE'
              }
            }
          ]
        }
      }
    }, {
      '$project': {
        '_id': 0, 
        'amount': 1, 
        'name': 1, 
        'image_url': 1, 
        'email': 1, 
        'id': 1,
        'customer_id': 1
      }
    }
  ];

  try {
    if (!MONGO_HANDLE) {
      MONGO_HANDLE = await connectToDatabase();
    }
    const data = await MONGO_HANDLE!.db.aggregate(mqlLatestInvoices).toArray();

    const latestInvoices = data.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
    return latestInvoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch the latest invoices.');
  }
}

export async function fetchCardData() {

  const mqlCardData = 
  [
    {
      '$group': {
        '_id': '$status', 
        'total': {
          '$sum': '$amount'
        }
      }
    }, {
      '$group': {
        '_id': null, 
        'values': {
          '$push': '$$ROOT'
        }
      }
    }, {
      '$replaceRoot': {
        'newRoot': {
          '$arrayToObject': {
            '$map': {
              'input': '$values', 
              'in': {
                'k': '$$this._id', 
                'v': '$$this.total'
              }
            }
          }
        }
      }
    }
  ];

  try {

    if (!MONGO_HANDLE) {
      MONGO_HANDLE = await connectToDatabase();
    }
    // You can probably combine these into a single SQL query
    // However, we are intentionally splitting them to demonstrate
    // how to initialize multiple queries in parallel with JS.
    const invoiceCountPromise = MONGO_HANDLE!.db.collection("invoices").countDocuments();
    const customerCountPromise = MONGO_HANDLE!.db.collection("customers").countDocuments();
    const invoiceStatusPromise = MONGO_HANDLE!.db.collection("invoices").aggregate(mqlCardData).toArray();
    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    

    const numberOfInvoices = data[0];
    const numberOfCustomers = data[1];
    const totalPaidInvoices = formatCurrency(data[2][0].paid ?? 0);
    const totalPendingInvoices = formatCurrency(data[2][0].pending ?? 0);

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number,
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;
  const mqlFetchFilteredInvoices = 
  [
    {
      '$lookup': {
        'from': 'customers', 
        'localField': 'customer_id', 
        'foreignField': 'id', 
        'as': 'customer'
      }
    }, {
      '$replaceRoot': {
        'newRoot': {
          '$mergeObjects': [
            {
              '$setField': {
                  'field': 'customer', 
                  'input': '$$ROOT', 
                  'value': '$$REMOVE'
              }
            }, 
            {
              '$setField': {
                'field': 'customer_id', 
                'input': {'$first': '$customer'},
                'value': '$$REMOVE'
              }
            }
          ]
        }
      }
    }, {
      '$project': {
        '_id': 0, 
        'id': 1, 
        'customer_id': 1,
        'amount': 1, 
        'date': 1, 
        'status': 1, 
        'name': 1, 
        'email': 1, 
        'image_url': 1
      }
    }, {
      '$match': {
        '$or': [
          {
            'name': {
              '$regex': query
            }
          }, {
            'email': {
              '$regex': query
            }
          }, {
            'amount': {
              '$regex': query
            }
          }, {
            'date': {
              '$regex': query
            }
          }, {
            'status': {
              '$regex': query
            }
          }
        ]
      }
    }, {
      '$sort': {
        'date': -1
      }
    }, {
      '$skip': offset
    }, {
      '$limit': ITEMS_PER_PAGE
    }
  ];

  try {
    if (!MONGO_HANDLE) {
      MONGO_HANDLE = await connectToDatabase();
    }
    const invoices = await MONGO_HANDLE!.db.collection("invoices").aggregate(mqlFetchFilteredInvoices).toArray();
    return invoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  }
}

export async function fetchInvoicesPages(query: string) {

  const mqlFetchInvoicePages = 
  [
    {
      '$lookup': {
        'from': 'customers', 
        'localField': 'customer_id', 
        'foreignField': 'id', 
        'as': 'customer'
      }
    }, {
      '$replaceRoot': {
        'newRoot': {
          '$mergeObjects': [
            {
              '$setField': {
                  'field': 'customer', 
                  'input': '$$ROOT', 
                  'value': '$$REMOVE'
              }
            }, 
            {
              '$setField': {
                'field': 'customer_id', 
                'input': {'$first': '$customer'},
                'value': '$$REMOVE'
              }
            }
          ]
        }
      }
    }, {
      '$match': {
        '$or': [
          {
            'name': {
              '$regex': query
            }
          }, {
            'email': {
              '$regex': query
            }
          }, {
            'amount': {
              '$regex': query
            }
          }, {
            'date': {
              '$regex': query
            }
          }, {
            'status': {
              '$regex': query
            }
          }
        ]
      }
    }, {
      '$count': 'count'
    }
  ];

  try {

    if (!MONGO_HANDLE) {
      MONGO_HANDLE = await connectToDatabase();
    }

    const countArr = await MONGO_HANDLE!.db.collection("invoices").aggregate(mqlFetchInvoicePages).toArray();
    const count = countArr[0].count;

    const totalPages = Math.ceil(count / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  }
}

export async function fetchInvoiceById(id: string) {
  try {
    if (!MONGO_HANDLE) {
      MONGO_HANDLE = await connectToDatabase();
    }
    const data = await MONGO_HANDLE!.db.collection("invoices").findOne({ id }, 
          { projection: { _id: 0, id: 1, customer_id: 1, amount: 1, status: 1} });

    const invoice = {
      ...data,
      // Convert amount from cents to dollars
      amount: data!.amount / 100,
    };

    return invoice;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  }
}

export async function fetchCustomers() {
  try {
    if (!MONGO_HANDLE) {
      MONGO_HANDLE = await connectToDatabase();
    }
    const customers = await MONGO_HANDLE!.db.collection("customers")
                        .find({}, {projection: {_id: 0, id: 1, name: 1}})
                        .sort({name: 1})
                        .toArray();
    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch all customers.');
  }
}

export async function fetchFilteredCustomers(query: string) {

  const mqlFetchFilteredCustomers =
  [
    {
      '$match': {
        '$or': [
          {
            'name': {
              '$regex': query
            }
          }, {
            'email': {
              '$regex': query
            }
          }
        ]
      }
    }, {
      '$lookup': {
        'from': 'invoices', 
        'localField': 'id', 
        'foreignField': 'customer_id', 
        'as': 'invoices'
      }
    }, {
      '$addFields': {
        'total_invoices': {
          '$size': '$invoices'
        }, 
        'total_pending': {
          '$reduce': {
            'input': '$invoices', 
            'initialValue': 0, 
            'in': {
              '$cond': {
                'if': {
                  '$eq': [
                    '$$this.status', 'pending'
                  ]
                }, 
                'then': {
                  '$add': [
                    '$$value', '$$this.amount'
                  ]
                }, 
                'else': '$$value'
              }
            }
          }
        }, 
        'total_paid': {
          '$reduce': {
            'input': '$invoices', 
            'initialValue': 0, 
            'in': {
              '$cond': {
                'if': {
                  '$eq': [
                    '$$this.status', 'paid'
                  ]
                }, 
                'then': {
                  '$add': [
                    '$$value', '$$this.amount'
                  ]
                }, 
                'else': '$$value'
              }
            }
          }
        }
      }
    }, {
      '$project': {
        '_id': 0
      }
    }, {
      '$sort': {
        'name': 1
      }
    }
  ];

  try {

    if (!MONGO_HANDLE) {
      MONGO_HANDLE = await connectToDatabase();
    }

    let data = await MONGO_HANDLE!.db.collection("customers").aggregate(mqlFetchFilteredCustomers).toArray();

    const customers = data.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch customer table.');
  }
}

export async function getUser(email: string) {
  try {
    if (!MONGO_HANDLE) {
      MONGO_HANDLE = await connectToDatabase();
    }
    
    const user = await MONGO_HANDLE!.db.collection("users").findOne({ email: email }, { projection: { _id: 0 } });
    //sql`SELECT * FROM users WHERE email=${email}`;
    return user as unknown as User;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw new Error('Failed to fetch user.');
  }
}

function printResults(test: string, results: any) {
  console.log(`[${test}]: ${JSON.stringify(results, null, 2)}`);
}

export async function test() {
  printResults('fetchRevenue', await fetchRevenue());
  printResults('fetchLatestInvoices', await fetchRevenue());
  printResults('fetchCardData', await fetchRevenue());
  printResults('fetchFilteredInvoices', await fetchFilteredInvoices('a', 1));
  printResults('fetchInvoicesPages', await fetchInvoicesPages('a'));
  printResults('fetchInvoiceById', await fetchInvoiceById('ea88f1ec-07ca-4324-a511-8a58d2d92680'));
  printResults('fetchCustomers', await fetchCustomers());
  printResults('fetchFilteredCustomers', await fetchFilteredCustomers('a'));
  printResults('getUser', await getUser('user@nextmail.com'));
}