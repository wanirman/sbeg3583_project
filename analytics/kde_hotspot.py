#!/usr/bin/env python3
"""
Layer 5 Analytics: KDE Hotspot analysis for biodiversity sightings.
Reads verified sightings from MongoDB, computes Kernel Density Estimation,
outputs a GeoJSON FeatureCollection for GeoServer.
"""

import os
import json
import math
from pymongo import MongoClient
from dotenv import dotenv_values

config = dotenv_values(os.path.join(os.path.dirname(__file__), '../backend/.env'))

def get_verified_sightings():
    client = MongoClient(config.get('MONGO_URI', 'mongodb://127.0.0.1:27017/biodiversity_pwa'))
    db = client['biodiversity_pwa']

    pipeline = [
        { '$match': { 'report_status': 'verified' } },
        { '$lookup': { 'from': 'categories', 'localField': 'category_id', 'foreignField': '_id', 'as': 'cat' } },
        { '$lookup': { 'from': 'species',    'localField': 'species_id',  'foreignField': '_id', 'as': 'spe' } },
        { '$unwind': { 'path': '$cat', 'preserveNullAndEmptyArrays': True } },
        { '$unwind': { 'path': '$spe', 'preserveNullAndEmptyArrays': True } },
        { '$project': {
            'longitude':     { '$arrayElemAt': ['$location.coordinates', 0] },
            'latitude':      { '$arrayElemAt': ['$location.coordinates', 1] },
            'category_name': '$cat.category_name',
            'species_name':  '$spe.species_name',
            'timestamp':     1,
        }},
    ]

    sightings = list(db['biodiversityreports'].aggregate(pipeline))
    client.close()
    return sightings

def gaussian_kernel(distance, bandwidth):
    return math.exp(-0.5 * (distance / bandwidth) ** 2)

def compute_kde(points, grid_resolution=50, bandwidth_deg=0.005):
    if not points:
        return []

    lats = [p['latitude']  for p in points]
    lngs = [p['longitude'] for p in points]

    lat_min, lat_max = min(lats) - 0.01, max(lats) + 0.01
    lng_min, lng_max = min(lngs) - 0.01, max(lngs) + 0.01
    lat_step = (lat_max - lat_min) / grid_resolution
    lng_step = (lng_max - lng_min) / grid_resolution

    cells = []
    for i in range(grid_resolution):
        for j in range(grid_resolution):
            cell_lat = lat_min + (i + 0.5) * lat_step
            cell_lng = lng_min + (j + 0.5) * lng_step
            density = sum(
                gaussian_kernel(
                    math.sqrt((cell_lat - p['latitude'])**2 + (cell_lng - p['longitude'])**2),
                    bandwidth_deg
                )
                for p in points
            )
            cells.append({'lat': cell_lat, 'lng': cell_lng, 'density': density})

    max_density = max(c['density'] for c in cells) if cells else 1
    for c in cells:
        c['density_norm'] = round(c['density'] / max_density, 4)

    return [c for c in cells if c['density_norm'] > 0.05]

def to_geojson(cells):
    return {
        'type': 'FeatureCollection',
        'features': [{
            'type': 'Feature',
            'geometry': { 'type': 'Point', 'coordinates': [c['lng'], c['lat']] },
            'properties': { 'density': c['density'], 'density_norm': c['density_norm'] },
        } for c in cells],
    }

def main():
    print('Fetching verified sightings...')
    sightings = get_verified_sightings()
    print(f'  {len(sightings)} sightings found.')

    result = to_geojson(compute_kde(sightings)) if sightings else { 'type': 'FeatureCollection', 'features': [] }

    out_path = os.path.join(os.path.dirname(__file__), 'hotspot.geojson')
    with open(out_path, 'w') as f:
        json.dump(result, f, indent=2)
    print(f'Hotspot GeoJSON written to {out_path}')

    summary = { 'total_sightings': len(sightings), 'hotspot_cells': len(result['features']), 'categories': {} }
    for s in sightings:
        cat = s.get('category_name', 'Unknown')
        summary['categories'][cat] = summary['categories'].get(cat, 0) + 1

    with open(os.path.join(os.path.dirname(__file__), 'analytics_summary.json'), 'w') as f:
        json.dump(summary, f, indent=2)
    print('Summary:', json.dumps(summary, indent=2))

if __name__ == '__main__':
    main()
