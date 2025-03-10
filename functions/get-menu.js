const Airtable = require('airtable');
require('dotenv').config();

// Configure Airtable
const base = new Airtable({apiKey: process.env.AIRTABLE_API_KEY})
  .base(process.env.AIRTABLE_BASE_ID);

exports.handler = async function(event, context) {
  try {
    // Fetch all data from Airtable
    const sections = await fetchTable('Sections', 'displayOrder');
    const products = await fetchTable('Products');
    const sectionPrices = await fetchTable('SectionPrices');
    
    console.log(`INFO  Fetched ${sections.length} sections, ${products.length} products, ${sectionPrices.length} prices`);
    
    // Construct menu data structure
    const menuData = {
      storeInfo: {
        name: "El Tío Green",
        tagline: "Premium Cannabis Collection",
        logo: "/images/logo.jpg"
      },
      defaultImages: {
        flower: "/images/default-flower.jpg",
        concentrate: "/images/default-concentrate.jpg",
        extract: "/images/default-extract.jpg",
        edible: "/images/default-edible.jpg"
      },
      sections: []
    };
    
    // Process each section
    for (const section of sections) {
      const sectionId = section.fields.id;
      const sectionRecordId = section.id; // Airtable's internal record ID
      
      const sectionData = {
        id: sectionId,
        title: section.fields.title || "Section",
        subtitle: section.fields.subtitle || "",
        icon: section.fields.icon || "📋"
      };
      
      // Handle Pods and Extracts sections (with display groups)
      if (sectionId === 'pods' || sectionId === 'extracts') {
        // Get products for this section using record ID
        const sectionProducts = products.filter(product => {
          return product.fields.Section && 
                 Array.isArray(product.fields.Section) && 
                 product.fields.Section.includes(sectionRecordId);
        });
        
        // Get unique display groups
        const displayGroups = [...new Set(
          sectionProducts
            .filter(product => product.fields.displayGroup)
            .map(product => product.fields.displayGroup)
        )];
        
        sectionData.categories = displayGroups.map(groupName => {
          // Get prices for this group
          const groupPrices = sectionPrices.filter(price => {
            return price.fields.Section && 
                   Array.isArray(price.fields.Section) && 
                   price.fields.Section.includes(sectionRecordId) &&
                   price.fields.displayGroup === groupName;
          }).map(price => ({
            weight: price.fields.weight || "",
            price: price.fields.price || ""
          }));
          
          // Get products for this group
          const groupProducts = sectionProducts
            .filter(product => product.fields.displayGroup === groupName)
            .map(product => ({
              name: product.fields.name || "Unnamed Product",
              type: product.fields.type || "",
              id: product.fields.id || product.id,
              imageUrl: product.fields.image ? product.fields.image[0].url : null
            }));
          
          return {
            title: groupName || "Unnamed Group",
            prices: groupPrices || [],
            products: groupProducts || []
          };
        });
      } 
      // Handle Donas section (special products)
      else if (sectionId === 'donas') {
        const donasProducts = products.filter(product => {
          return product.fields.Section && 
                 Array.isArray(product.fields.Section) && 
                 product.fields.Section.includes(sectionRecordId);
        }).map(product => {
          // Check for multiple prices
          const hasMultiplePrices = product.fields.individualPrice && 
                                   product.fields.individualPrice.includes(',');
          
          const productData = {
            name: product.fields.name || "Unnamed Product",
            description: product.fields.description || "",
            id: product.fields.id || product.id,
            imageUrl: product.fields.image ? product.fields.image[0].url : null
          };
          
          // Handle price format
          if (hasMultiplePrices) {
            const pricePoints = product.fields.individualPrice.split(',').map(p => p.trim());
            productData.prices = pricePoints.map(pricePoint => {
              const parts = pricePoint.split(':').map(part => part.trim());
              return { 
                quantity: parts[0] || "",
                price: parts[1] || parts[0] || "" 
              };
            });
          } else {
            productData.price = product.fields.individualPrice || "$0";
          }
          
          return productData;
        });
        
        sectionData.specialProducts = donasProducts || [];
      } 
      // Handle standard sections
      else {
        // Get prices for this section
        const prices = sectionPrices.filter(price => {
          return price.fields.Section && 
                 Array.isArray(price.fields.Section) && 
                 price.fields.Section.includes(sectionRecordId);
        }).map(price => ({
          weight: price.fields.weight || "",
          price: price.fields.price || ""
        }));
        
        // Get products for this section
        const sectionProducts = products.filter(product => {
          return product.fields.Section && 
                 Array.isArray(product.fields.Section) && 
                 product.fields.Section.includes(sectionRecordId);
        }).map(product => ({
          name: product.fields.name || "Unnamed Product",
          type: product.fields.type || "",
          id: product.fields.id || product.id,
          imageUrl: product.fields.image ? product.fields.image[0].url : null
        }));
        
        sectionData.prices = prices || [];
        sectionData.products = sectionProducts || [];
      }
      
      menuData.sections.push(sectionData);
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify(menuData)
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to fetch menu data', 
        details: error.message,
        stack: error.stack
      })
    };
  }
};

// Helper function to fetch all records from a table
async function fetchTable(tableName, sortField = null) {
  const records = [];
  
  const options = {};
  if (sortField) {
    options.sort = [{ field: sortField }];
  }
  
  await base(tableName).select(options).eachPage((pageRecords, fetchNextPage) => {
    records.push(...pageRecords);
    fetchNextPage();
  });
  
  return records;
}